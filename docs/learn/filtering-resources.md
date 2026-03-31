---
title: Filtering Resources
sidebar_position: 3
---

# Filter Resources by Labels

You can filter Kubernetes resources by labels to find specific Pods, Deployments, Services, and other resources.

## How to Use

Look for the **Label Selector** field at the top of any resource list. Type your filter and press **Enter**.

**Examples:**

Find resources with `app=nginx`:
```
app=nginx
```

Find resources with multiple labels (both must match):
```
app=nginx,env=production
```

Find resources where `env` is `production` or `staging`:
```
env in (production,staging)
```

Find resources where `tier` is not `backend`:
```
tier!=backend
```

## Clear Filter

Click the **X** button inside the input field.

## Keyboard Shortcuts

- **Enter** - Apply filter
- **Escape** - Clear filter

## Notes

- Filters are saved in your browser for each cluster
- Filters appear in the URL so you can share filtered views
- You can use label filters together with namespace filters
