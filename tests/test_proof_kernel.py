"""Tests for proof_kernel.scoped_failure — failure classification and proof assembly."""

import json
import os
import sys
import pytest

# Ensure repo root is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from proof_kernel.scoped_failure import (
    FailureScope,
    NECESSARY_CONDITIONS,
    classify_experiment_failure,
    build_proof_assembly,
)


class TestFailureScope:
    def test_kill_theory_only_nc4(self):
        """Only NC4 (predicate transport) has KILL_THEORY scope."""
        theory_killers = [
            nc_id for nc_id, nc in NECESSARY_CONDITIONS.items()
            if nc["failure_scope"] == FailureScope.KILL_THEORY
        ]
        assert theory_killers == ["NC4"]

    def test_kill_formalization_nc1_nc2_nc3(self):
        """NC1, NC2, NC3 have KILL_FORMALIZATION scope."""
        formalization = [
            nc_id for nc_id, nc in NECESSARY_CONDITIONS.items()
            if nc["failure_scope"] == FailureScope.KILL_FORMALIZATION
        ]
        assert sorted(formalization) == ["NC1", "NC2", "NC3"]

    def test_kill_route_nc5_nc6_nc7(self):
        """NC5, NC6, NC7 have KILL_ROUTE scope."""
        route = [
            nc_id for nc_id, nc in NECESSARY_CONDITIONS.items()
            if nc["failure_scope"] == FailureScope.KILL_ROUTE
        ]
        assert sorted(route) == ["NC5", "NC6", "NC7"]

    def test_seven_conditions(self):
        """Exactly seven necessary conditions."""
        assert len(NECESSARY_CONDITIONS) == 7


class TestClassifyExperimentFailure:
    def test_passing_experiment_no_kill(self):
        scope, nc_id, _ = classify_experiment_failure("EXP_1", "PASS", "PROOF_OBLIGATION_WITNESS")
        assert scope == FailureScope.NO_KILL
        assert nc_id is None

    def test_exp6_fail_threatens_nc4(self):
        scope, nc_id, _ = classify_experiment_failure("EXP_6", "FAIL", "PROOF_OBLIGATION_WITNESS")
        assert scope == FailureScope.KILL_THEORY
        assert nc_id == "NC4"

    def test_exp1_fail_threatens_nc1(self):
        scope, nc_id, _ = classify_experiment_failure("EXP_1", "FAIL", "PROOF_OBLIGATION_WITNESS")
        assert scope == FailureScope.KILL_FORMALIZATION
        assert nc_id == "NC1"

    def test_exp1b_fail_threatens_nc2(self):
        scope, nc_id, _ = classify_experiment_failure("EXP_1B", "FAIL", "CONTROL")
        assert scope == FailureScope.KILL_FORMALIZATION
        assert nc_id == "NC2"

    def test_exp2_fail_threatens_nc6(self):
        scope, nc_id, _ = classify_experiment_failure("EXP_2", "FAIL", "EXPLORATORY")
        assert scope == FailureScope.KILL_ROUTE
        assert nc_id == "NC6"

    def test_control_instrument_kill(self):
        scope, nc_id, _ = classify_experiment_failure("EXP_3", "FAIL", "CONTROL")
        assert scope == FailureScope.KILL_INSTRUMENT
        assert nc_id is None

    def test_pathfinder_no_kill(self):
        scope, nc_id, _ = classify_experiment_failure("EXP_4", "FAIL", "PATHFINDER")
        assert scope == FailureScope.NO_KILL
        assert nc_id is None


class TestBuildProofAssembly:
    @pytest.fixture
    def passing_experiments(self):
        """Simulate summary.experiments with all core passing."""
        return {
            "EXP_1": {"outcome": "CONSISTENT", "status": "PASS", "function": "PROOF_OBLIGATION_WITNESS"},
            "EXP_1B": {"outcome": "IMPLEMENTATION_OK", "status": "PASS", "function": "CONTROL"},
            "EXP_6": {"outcome": "CONSISTENT", "status": "PASS", "function": "PROOF_OBLIGATION_WITNESS"},
            "EXP_8": {"outcome": "CONSISTENT", "status": "PASS", "function": "PROOF_OBLIGATION_WITNESS"},
            "EXP_9": {"outcome": "INFORMATIONAL", "status": "PASS", "function": "DEMONSTRATION"},
        }

    def test_all_pass_authoritative(self, passing_experiments):
        assembly = build_proof_assembly(passing_experiments, "AUTHORITATIVE")
        assert assembly["theory_alive"] is True
        assert assembly["formalization_alive"] is True
        assert assembly["overall_status"] == "CANDIDATE"
        # NC1 should be witnessed (EXP_1 and EXP_8 pass)
        assert assembly["conditions"]["NC1"]["status"] == "WITNESSED"
        # NC4 should be witnessed (EXP_6 passes)
        assert assembly["conditions"]["NC4"]["status"] == "WITNESSED"

    def test_all_pass_smoke(self, passing_experiments):
        assembly = build_proof_assembly(passing_experiments, "SMOKE")
        # NC1 should be provisional at smoke tier
        assert assembly["conditions"]["NC1"]["status"] == "WITNESSED_PROVISIONAL"

    def test_nc3_always_unformalized(self, passing_experiments):
        assembly = build_proof_assembly(passing_experiments, "AUTHORITATIVE")
        # NC3 has no bearing experiments — always unformalized
        assert assembly["conditions"]["NC3"]["status"] == "UNFORMALIZED"

    def test_nc7_always_unformalized(self, passing_experiments):
        assembly = build_proof_assembly(passing_experiments, "AUTHORITATIVE")
        assert assembly["conditions"]["NC7"]["status"] == "UNFORMALIZED"

    def test_exp6_failure_kills_theory(self, passing_experiments):
        passing_experiments["EXP_6"]["outcome"] = "INCONSISTENT"
        passing_experiments["EXP_6"]["status"] = "FAIL"
        assembly = build_proof_assembly(passing_experiments, "AUTHORITATIVE")
        assert assembly["theory_alive"] is False
        assert assembly["overall_status"] == "DISCREDITED"
        assert assembly["conditions"]["NC4"]["status"] == "FAILED"

    def test_exp1_failure_kills_formalization(self, passing_experiments):
        passing_experiments["EXP_1"]["outcome"] = "INCONSISTENT"
        passing_experiments["EXP_1"]["status"] = "FAIL"
        assembly = build_proof_assembly(passing_experiments, "AUTHORITATIVE")
        assert assembly["formalization_alive"] is False
        assert assembly["overall_status"] == "FORMALIZATION_BROKEN"
        # Theory is still alive because EXP_1 failure only kills formalization
        assert assembly["theory_alive"] is True

    def test_exp2_failure_kills_route(self, passing_experiments):
        passing_experiments["EXP_2"] = {
            "outcome": "INCONSISTENT", "status": "FAIL", "function": "EXPLORATORY"
        }
        assembly = build_proof_assembly(passing_experiments, "AUTHORITATIVE")
        assert assembly["contradiction_route_alive"] is False
        # Theory and formalization are unaffected
        assert assembly["theory_alive"] is True
        assert assembly["formalization_alive"] is True

    def test_certificate_integration(self, passing_experiments):
        cert = {"status": "SAME_OBJECT_CANDIDATE"}
        assembly = build_proof_assembly(passing_experiments, "AUTHORITATIVE", cert)
        assert assembly["certificate_status"] == "SAME_OBJECT_CANDIDATE"

    def test_certificate_failure(self, passing_experiments):
        cert = {"status": "SAME_OBJECT_FAILED"}
        assembly = build_proof_assembly(passing_experiments, "AUTHORITATIVE", cert)
        assert assembly["certificate_status"] == "SAME_OBJECT_FAILED"
        assert assembly["overall_status"] == "SAME_OBJECT_FAILED"

    def test_remaining_steps(self, passing_experiments):
        assembly = build_proof_assembly(passing_experiments, "AUTHORITATIVE")
        remaining_ids = [s["nc_id"] for s in assembly["remaining_steps"]]
        # NC3 and NC7 have no bearing experiments, should be remaining
        assert "NC3" in remaining_ids
        assert "NC7" in remaining_ids

    def test_empty_experiments(self):
        assembly = build_proof_assembly({}, "AUTHORITATIVE")
        assert assembly["theory_alive"] is True
        not_tested = [
            nc_id for nc_id, c in assembly["conditions"].items()
            if c["status"] == "NOT_TESTED"
        ]
        # NC1, NC2, NC4, NC5 have bearing experiments that are missing
        assert len(not_tested) >= 4


class TestCertificateBuilder:
    """Test the certificate builder produces valid JSON."""

    def test_certificate_builds(self):
        """Certificate builder runs without error if experiments.json exists."""
        exp_path = os.path.join("public", "experiments.json")
        if not os.path.exists(exp_path):
            pytest.skip("No experiments.json — certificate builder cannot run")

        from proof_kernel.same_object_certificate import build_certificate
        cert = build_certificate(exp_path)
        assert cert["status"] in (
            "NOT_READY", "SAME_OBJECT_CANDIDATE", "SAME_OBJECT_FAILED",
            "INCONCLUSIVE", "FORMAL_PROOF_REQUIRED",
        )
        assert "certificate_id" in cert
        assert "reconstruction_agreement" in cert
        assert "zero_handling" in cert
        assert "predicate_preservation" in cert
        assert "controls" in cert
        assert "remaining_formal_step" in cert

    def test_certificate_sections_have_result(self):
        """Each certificate section has a result field."""
        exp_path = os.path.join("public", "experiments.json")
        if not os.path.exists(exp_path):
            pytest.skip("No experiments.json")

        from proof_kernel.same_object_certificate import build_certificate
        cert = build_certificate(exp_path)
        for section in ("reconstruction_agreement", "zero_handling", "predicate_preservation"):
            assert cert[section]["result"] in ("PASS", "FAIL", "INCONCLUSIVE", "NOT_TESTED"), \
                f"Section {section} has unexpected result: {cert[section]['result']}"
