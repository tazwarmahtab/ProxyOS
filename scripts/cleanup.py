import shutil
import os

root = os.path.join(os.sep, "vercel", "share", "v0-project")
targets = ["apps", "packages", ".next", "node_modules"]
for t in targets:
    p = os.path.join(root, t)
    if os.path.isdir(p):
        shutil.rmtree(p)
        print("removed " + t)
    else:
        print("skip " + t)
print("cleanup complete")
