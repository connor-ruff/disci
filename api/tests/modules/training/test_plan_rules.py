import datetime as dt
from decimal import Decimal

from app.modules.training.plans import parse_grid, score_week, week_start

D = dt.date


def test_grid_reads_a_sheet_copy() -> None:
    text = (
        "Week start date\tMonday\tTuesday\tWednesday\tThursday\tFriday\tSaturday\tSunday\tTotal\n"
        "4/26/2027\t\t3\t\t3\t\t6 long run\t\t12\n"
        "5/3/2027\trest\t3.5\t0\t4 mi tempo\t-\t7\tXT\t14.5\n"
    )
    grid = parse_grid(text)
    assert grid.weeks == 2
    assert [(d.day_on, d.planned_miles, d.notes) for d in grid.days] == [
        (D(2027, 4, 27), Decimal("3.00"), None),
        (D(2027, 4, 29), Decimal("3.00"), None),
        (D(2027, 5, 1), Decimal("6.00"), "long run"),
        (D(2027, 5, 4), Decimal("3.50"), None),
        (D(2027, 5, 6), Decimal("4.00"), "tempo"),
        (D(2027, 5, 8), Decimal("7.00"), None),
    ]
    # The header row and the "XT" cell are reported; the Total column is ignored.
    assert len(grid.skipped) == 2
    assert "2027-05-09" in grid.skipped[1]


def test_grid_takes_commas_and_iso_dates_and_keeps_the_later_duplicate() -> None:
    grid = parse_grid("2027-04-26,,3,,,,,\n2027-04-26,,4,,,,,\n")
    assert [(d.day_on, d.planned_miles) for d in grid.days] == [(D(2027, 4, 27), Decimal("4.00"))]


def test_week_start_follows_the_users_first_day() -> None:
    wed = D(2026, 11, 4)
    assert week_start(wed, 1) == D(2026, 11, 2)  # Monday
    assert week_start(wed, 7) == D(2026, 11, 1)  # Sunday
    assert week_start(D(2026, 11, 2), 1) == D(2026, 11, 2)


def score(miles: list[tuple[str, str]], *, today: dt.date, set_target=None, walks=False, pct=90):
    return score_week(
        D(2027, 7, 12),
        today=today,
        planned=[Decimal(5), Decimal(6), Decimal(9)],  # target 20, band 18–22
        set_target=set_target,
        workouts=[{"type": t, "miles": m} for t, m in miles],
        count_walk_miles=walks,
        cross_train_at_pct=pct,
        has_plan=True,
    )


AFTER = D(2027, 7, 20)
DURING = D(2027, 7, 14)


def test_finished_weeks_are_under_in_range_or_over() -> None:
    assert score([("run", "17.9")], today=AFTER).status == "under"
    assert score([("run", "18")], today=AFTER).status == "in_range"
    assert score([("run", "22")], today=AFTER).status == "in_range"
    over = score([("run", "22.5")], today=AFTER)
    assert (over.status, over.band_low, over.band_high) == (
        "over",
        Decimal("18.00"),
        Decimal("22.00"),
    )


def test_the_current_week_is_in_progress_until_it_gets_there() -> None:
    assert score([("run", "5")], today=DURING).status == "in_progress"
    assert score([("run", "19")], today=DURING).status == "in_range"
    assert score([], today=D(2027, 7, 1)).status == "upcoming"


def test_walks_count_only_when_the_plan_says_so() -> None:
    done = [("run", "15"), ("walk", "4"), ("bike", "20")]
    assert score(done, today=AFTER).miles_done == Decimal("15.00")
    assert score(done, today=AFTER, walks=True).miles_done == Decimal("19.00")


def test_a_set_target_wins_and_the_cross_train_cue_follows_the_pct() -> None:
    week = score([("run", "18")], today=DURING, set_target=Decimal(25))
    assert (week.target_miles, week.target_is_set, week.status) == (
        Decimal("25.00"),
        True,
        "in_progress",
    )
    assert score([("run", "18")], today=DURING).cross_train is True  # 90% of 20
    assert score([("run", "18")], today=DURING, pct=100).cross_train is False
    assert score([("run", "5"), ("run", "4")], today=DURING).runs_done == 2


def test_no_plan_means_no_status() -> None:
    week = score_week(
        D(2027, 7, 12), today=AFTER, planned=[], set_target=None,
        workouts=[{"type": "run", "miles": "3"}], count_walk_miles=False,
        cross_train_at_pct=90, has_plan=False,
    )  # fmt: skip
    assert (week.status, week.target_miles, week.miles_done) == ("none", None, Decimal("3.00"))
