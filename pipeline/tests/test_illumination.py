"""Sunlit fraction from sub-points + a horizon profile."""
import numpy as np
import pytest

from illumination import horizon_at, lit_fraction


def test_horizon_interpolates_and_wraps():
    profile = np.zeros(360)
    profile[359], profile[0] = 2.0, 4.0
    assert horizon_at(profile, np.array([359.5]))[0] == pytest.approx(3.0)
    assert horizon_at(profile, np.array([0.0, 0.5]))[1] == pytest.approx(2.0)


def test_equator_with_flat_horizon_is_lit_half_the_time():
    assert lit_fraction(0.0, 0.0, np.zeros(360), years=[2027]) == pytest.approx(0.5, abs=0.02)


def test_wall_all_around_means_darkness():
    assert lit_fraction(0.0, 0.0, np.full(360, 90.0), years=[2027]) == 0.0


def test_pole_with_flat_horizon_is_lit_about_half_the_time():
    # the Sun circles the pole within ~1.5 deg of the horizon; with a flat horizon
    # it is up roughly half the year (lunar "seasons" from the 1.54 deg tilt)
    assert 0.35 < lit_fraction(-89.99, 0.0, np.zeros(360), years=[2027]) < 0.65
