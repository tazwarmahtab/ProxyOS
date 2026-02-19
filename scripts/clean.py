import shutil
import os

root = "/vercel/share/v0-project"

dirs_to_remove = [
    os.path.join(root, "apps"),
    os.path.join(root, "packages"),
    os.path.join(root, ".next"),
    os.path.join(root, "node_modules"),
]

for d in dirs_to_remove:
    if os.path.exists(d):
        print(f"Removing {d}...")
        shutil.rmtree(d)
        print(f"  Removed {d}")
    else:
        print(f"  Skipping {d} (not found)")

print("Done! Stale directories cleaned.")
