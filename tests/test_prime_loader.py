from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import riemann_math  # noqa: E402


def _reset_prime_state() -> None:
    riemann_math._PRIMES_CACHE = None
    riemann_math._PRIMES_CACHE_INFO = {"bad_rows": 0}
    riemann_math.LAST_PRIME_SOURCE_INFO = {}
    riemann_math.configure_prime_policy(prime_min_count=0, prime_target_count=0)


def test_parse_prime_line_accepts_mixed_formats() -> None:
    assert riemann_math._parse_prime_line('"15,485,863"\n') == (15485863, True)
    assert riemann_math._parse_prime_line('"49,979,653.00"\n') == (49979653, True)
    assert riemann_math._parse_prime_line("   32452843   \n") == (32452843, True)


def test_prime_loader_counts_bad_rows_and_uses_file_when_sufficient(tmp_path, monkeypatch) -> None:
    _reset_prime_state()
    primes_file = tmp_path / "primes.csv"
    primes_file.write_text(
        "\n".join(
            [
                "2",
                "3",
                '"5"',
                '"7.00"',
                "bad_row",
                '"11,000"',
            ]
        ),
        encoding="utf-8",
    )

    monkeypatch.setattr(riemann_math, "PRIMES_FILE", str(primes_file))
    riemann_math.configure_prime_policy(prime_min_count=5, prime_target_count=5)
    primes = riemann_math.get_primes(13)
    info = riemann_math.get_last_prime_source_info()

    assert len(primes) >= 5
    assert info["source_kind"] == "prime_file"
    assert info["loaded_count"] == 5
    assert info["bad_rows"] == 1
    assert info["max_prime"] == 11000


def test_prime_min_policy_reports_failure_when_fallback_breaks(tmp_path, monkeypatch) -> None:
    _reset_prime_state()
    primes_file = tmp_path / "primes.csv"
    primes_file.write_text("2\n3\n", encoding="utf-8")

    monkeypatch.setattr(riemann_math, "PRIMES_FILE", str(primes_file))
    riemann_math.configure_prime_policy(prime_min_count=10, prime_target_count=10)

    def broken_sieve(min_count: int, max_val: int):
        raise RuntimeError(f"sieve failed for min_count={min_count}, max_val={max_val}")

    monkeypatch.setattr(riemann_math, "_sieve_primes_with_floor", broken_sieve)

    with pytest.raises(RuntimeError):
        riemann_math.get_primes(100)

    info = riemann_math.get_last_prime_source_info()
    assert info["valid"] is False
    assert any("Sieve fallback failed" in msg for msg in info["errors"])
