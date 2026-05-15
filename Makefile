.PHONY: ncu

## ncu — bump all dependencies to latest across the monorepo
ncu:
	ncu -u --workspaces --root
	@echo "Done. Run npm install to apply."
