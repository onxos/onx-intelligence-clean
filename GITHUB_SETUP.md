# GITHUB SETUP — ONX Intelligence Founder Alpha

## Repository: github.com/onuraymac/ONX-Intelligence

### Initial Setup
```bash
git init
git remote add origin https://github.com/onuraymac/ONX-Intelligence.git
git add .
git commit -m "Founder Alpha: Initial deployment"
git push -u origin main
```

### Branch Structure
```
main          → Production (Founder Alpha)
develop       → Development
feature/*     → Feature branches
hotfix/*      → Hotfix branches
archive/*     → Archived work
```

### Git Tags
```bash
git tag -a founder-alpha-20260623 -m "Founder Alpha Full Deployment"
git push origin founder-alpha-20260623
```

### Git Ignore
```
.env
node_modules/
*.log
dist/
.DS_Store
```

### CI/CD Pipeline (GitHub Actions)
See `.github/workflows/deploy.yml` (template provided in `deployment/founder-alpha/`)
