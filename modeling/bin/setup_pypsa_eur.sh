#!/usr/bin/env bash
# Set up the vendored PyPSA-Eur clone for stromtest-2035 runs.
#
# 1. Apply the patches in modeling/patches/ (idempotent — skips if already applied).
# 2. Copy the test config from modeling/configs/ into pypsa_eur/config/.
#
# Run from modeling/ (the directory containing pypsa_eur/, configs/, patches/).

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d pypsa_eur ]; then
    echo "ERROR: modeling/pypsa_eur/ not found." >&2
    echo "Clone it first: git clone --depth=1 https://github.com/PyPSA/pypsa-eur.git modeling/pypsa_eur" >&2
    exit 1
fi

for patch_file in patches/*.patch; do
    [ -e "$patch_file" ] || continue
    if patch --dry-run -p1 -R -d pypsa_eur -i "../$patch_file" >/dev/null 2>&1; then
        echo "patch $(basename "$patch_file") already applied; skipping"
    else
        echo "applying $(basename "$patch_file")"
        patch -p1 -d pypsa_eur -i "../$patch_file"
    fi
done

for cfg in configs/*.yaml; do
    [ -e "$cfg" ] || continue
    name=$(basename "$cfg")
    target="pypsa_eur/config/config.${name}"
    cp -f "$cfg" "$target"
    echo "config $name -> $target"
done

echo "PyPSA-Eur setup complete."
