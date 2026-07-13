---
title: Projects
sidebar_position: 5
---

# Projects

Headlamp Projects makes managing Kubernetes easier by providing an application-centric view. Projects organize workloads across multiple namespaces and clusters into one logical group. This approach offers developers offers more clarity as opposed to traditional list views. The Projects feature makes collaboration, troubleshooting, and onboarding much simpler.

## Why Use Projects

Kubernetes applications often span multiple resources and namespaces, which can make management feel fragmented. Projects solve this by:

- Providing a cluster-scoped view of everything that belongs to your application

- Reducing complexity for developers and new users

- Supporting multi-cluster environments without extra configuration

- Respecting Kubernetes RBAC so users only see resources they have permission to access

Projects are built on native Kubernetes resources with no custom CRDs required. Headlamp adds a visual layer that brings these resources together, lowering the barrier to entry and making Kubernetes more approachable.

## Creating a Project

### Option 1: Create a Project in the UI

1. From the home dashboard, open **Projects**.
2. Click **Create Project**.
3. Fill in these details:

   - **Project Name** — A unique name for your project.
   - **Cluster(s)** — Select one or more clusters to include.
   - **Namespace** — Choose or create the namespace associated with this project.

4. Click **Create** to finalize.

Once created, the project appears in your list.  
Selecting it opens a detailed view that includes tabs for **Overview**, **Resources**, **Access**, and **Map**.

![Create Project UI](https://github.com/user-attachments/assets/b8c495e9-dc56-454f-a450-bf742a8d82f5)

---

### Option 2: Create a Project from YAML

You can also associate resources with a project by importing a YAML file:

1. In the **Create Project** dialog, select **From YAML**.
2. Fill in these details:

   - **Project Name** — A unique name for your project.
   - **Cluster(s)** — Select one or more clusters to include.

3. Upload a file or paste a URL to a hosted YAML file.
4. Click **Create** to finalize.

![Create Project from YAML](https://github.com/user-attachments/assets/44469721-09b3-4822-ae5c-3b266a65c9ae)

## Working with Projects

After creating a project, you can explore it using the available tabs in the Project details view.

### Overview Tab

![Project Overview](https://github.com/user-attachments/assets/a03ed234-e734-47e2-86d6-2bf11bf71963)

Scattered details across multiple views can make understanding application context difficult. The Overview tab solves this via a single project-scoped view. This view gathers labels, annotations, linked clusters, and included namespaces in one location.

### Resources Tab

![Project Resources](https://github.com/user-attachments/assets/fbca87df-34ad-423f-995c-3c04d72ac5b9)

Resource navigation across multiple clusters and namespaces can be slow and error-prone. The Resources tab smooths navigation by listing deployments, pods, services, and other objects. With Project aggregation, developers no longer need to search through unrelated data.

### Access Tab

![Project Access](https://github.com/user-attachments/assets/c0e56948-6fdd-4a4e-b678-7cb5418cb9a3)

Managing permissions in Kubernetes can be confusing often making developer access unclear. The Access tab provides clarity and safety by showing who can interact with project resources. Headlamp respects Kubernetes RBAC, so users only see and manage what they are allowed to, reducing mistakes and improving security.

### Map Tab

![Project Map](https://github.com/user-attachments/assets/87341cfd-3978-4555-b34b-020e4666c789)

Understanding dependencies and relationships through list views can be difficult and time-consuming. The Map tab provides a visual representation of the relationship between project resources. Using the map makes it easier to follow connections like services to pods and configurations. This also makes it easier to spot issues like broken links, missing dependencies, and unhealthy workloads.

## Use Cases

### Multi-environment management

Teams often manage dev, test, and prod across clusters, causing drift and slow handoffs. Projects give each environment a defined space, keeping resources organized. Grouping resources under one project reduces errors and simplifies releases.

### Developer onboarding

Kubernetes can overwhelm new developers with cluttered views and unclear access. Projects simplify onboarding by showing only what is relevant and respecting RBAC permissions. A lead creates the project, and new devs can start deploying and monitoring right away.

### Troubleshooting and monitoring

Triage slows when logs and metrics are scattered across tools and clusters. Projects focus data within the app boundary so teams can see only relevant signals. With everything scoped to the project, devs can trace issues and fix them faster.

## Get Started Today

Headlamp Projects make Kubernetes simpler, and more application focused. Create a project, link resources, and give your team a clear space to collaborate.

Open Headlamp, select Projects, and start organizing your applications for faster onboarding, easier troubleshooting, and better team alignment.
