---
title: Projects
sidebar_position: 5
---

# Projects

The Projects feature in Headlamp allows you to group and manage Kubernetes resources across multiple clusters. A project combines one or more clusters under a single namespace, providing a unified view and management interface. This is particularly useful for teams working on multi-cluster deployments, as it enables easier resource organization and access control.

By default, Headlamp provides a cluster-centric view of your Kubernetes resources. However, with Projects, you can shift to a namespace-centric perspective that spans multiple clusters. This allows you to see all resources associated with a specific project in one place, regardless of which cluster they reside in.

## Creating a Project

### Option 1: Create a Project in the UI

1. From the home dashboard, open **Projects**.
2. Click **Create Project**.
3. Fill in the required details:

   - **Project Name** — A unique name for your project.
   - **Cluster(s)** — Select one or more clusters to include.
   - **Namespace** — Choose or create the namespace associated with this project.

4. Click **Create** to finalize setup.

Once created, the project appears in your list.  
Selecting it opens a detailed view that includes tabs for **Overview**, **Resources**, **Access**, and **Map**.

---

### Option 2: Create a Project from YAML

You can also add resources to a project by importing a YAML configuration file. This associates existing clusters and resources into the project’s namespace.
Resources defined in your YAML file are added to the **project’s namespace** automatically.

1. In the **Create Project** dialog, select **From YAML**.
2. Fill in the required details:

   - **Project Name** — A unique name for your project.
   - **Cluster(s)** — Select a cluster to add resources to.

3. Choose one of the following options:
   - **Upload File** – Import a YAML file from your computer.
   - **Use URL** – Paste a link to a hosted YAML file.
4. Click **Create** once the configuration loads.

Once created, your projects will be listed in the "Projects" section.

## Working with Projects

After creating a project, you can explore it using the available tabs in the Project details view.

### Overview Tab

![Project Overview](https://github.com/user-attachments/assets/a03ed234-e734-47e2-86d6-2bf11bf71963)

Provides a high-level summary of the project — similar to a namespace view, but extended across multiple clusters.  
Here you can see general information like labels, annotations, and linked clusters.

### Resources Tab

![Project Resources](https://github.com/user-attachments/assets/fbca87df-34ad-423f-995c-3c04d72ac5b9)

Lists most of the same resources you’d see in a cluster view, scoped to your project namespace.  
Some resource types may not appear (like Pods in certain cluster configurations).  
This tab aggregates resources from all clusters associated with the project.

### Access Tab

![Project Access](https://github.com/user-attachments/assets/c0e56948-6fdd-4a4e-b678-7cb5418cb9a3)

Displays and manages access controls for the project, similar to how you’d manage permissions within a namespace.

### Map Tab

![Project Map](https://github.com/user-attachments/assets/87341cfd-3978-4555-b34b-020e4666c789)

Shows a visual map of the resources within your project.  
This view uses the same resource map as in cluster mode, but filters results to only display items belonging to your project namespace.
