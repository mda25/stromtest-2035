"""Translate a stromtest scenario into PyPSA-Eur configuration.

V0 stub. The full translation logic lands in build step 5 once we've completed
the PyPSA-Eur reading week and know which extension points we're configuring.
Until then this module documents the intended surface so the rest of the code
(CLI, Snakefile, tests) can reference it.
"""

from __future__ import annotations

from pathlib import Path

from stromtest.translation.schema import Scenario


def translate(scenario: Scenario, output_dir: Path) -> None:
    """Translate a validated scenario into PyPSA-Eur input files under output_dir.

    Not implemented in V0 scaffolding. Step 5 in docs/design.md.
    """
    raise NotImplementedError("Translation lands in build step 5; see docs/design.md Next Steps.")
