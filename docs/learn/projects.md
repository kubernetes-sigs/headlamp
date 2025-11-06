---
title: Projects
sidebar_position: 5
---

# Projects

Headlamp Projects make Kubernetes easier to manage by grouping related resources into a single, application-centric view that is designed with developers in mind. Instead of navigating cluster-wide lists or searching for labels, Projects let you organize workloads across one or more namespaces and even multiple clusters into a logical group. This approach gives developers clarity on their application as a whole, making collaboration, troubleshooting, and onboarding much simpler.

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

Teams often struggle to understand application context because labels, annotations, and cluster details are scattered across multiple views. The Overview tab solves this by providing a single, project-scoped snapshot that brings labels, annotations, linked clusters, and included namespaces together. This clarity helps teams align quickly and reduces time spent piecing information together.

### Resources Tab

![Project Resources](https://github.com/user-attachments/assets/fbca87df-34ad-423f-995c-3c04d72ac5b9)

Finding the right resources across clusters and namespaces can be slow and error-prone when using cluster-wide views. The Resources tab eliminates this friction by listing deployments, pods, services, and other objects scoped to the project. Everything is aggregated across associated clusters, so developers can navigate faster and focus on the application instead of searching through unrelated data.

### Access Tab

![Project Access](https://github.com/user-attachments/assets/c0e56948-6fdd-4a4e-b678-7cb5418cb9a3)

Managing permissions in Kubernetes can be confusing, and developers often do not know where they have access. The Access tab provides confidence and safety by showing who can interact with project resources. Headlamp respects Kubernetes RBAC, so users only see and manage what they are allowed to, reducing mistakes and improving security.

### Map Tab

![Project Map](https://github.com/user-attachments/assets/87341cfd-3978-4555-b34b-020e4666c789)

Understanding dependencies and relationships through lists alone is difficult, which slows troubleshooting and planning. The Map tab gives teams a visual representation of how resources within the project connect, such as services to pods and configurations. This makes it easier to spot broken links, missing dependencies, and unhealthy workloads, speeding up issue resolution and improving application reliability.

## Use Cases

### Multi-environment management

Teams often juggle development, test, and production with resources spread across clusters and namespaces, which leads to drift, mistakes, and slow handoffs. Projects give each environment a clear and scoped home so the team sees only what belongs to that environment. By grouping resources across namespaces and even clusters under a single project, you reduce confusion, prevent accidental changes in the wrong place, and create a shared context for releases and rollbacks.

### Developer onboarding

New developers usually face a wall of Kubernetes complexity with scattered views, YAML hunting, and uncertainty about where they have access. Projects provide an application centric space that shows only the resources that matter, while honoring Kubernetes RBAC so people see what they are allowed to work with. A lead can create a project in a few clicks, and a new developer can sign in, find the app, deploy changes, and monitor results without navigating cluster internals.

### Troubleshooting and monitoring

Triage slows down when logs, events, metrics, and relationships are spread across tools and cluster wide views. Projects scope operational data to the application boundary so teams can focus on relevant signals instead of sifting through noise. With resources, logs, events, metrics, and the map all filtered to the project, developers can spot broken links, understand dependencies, and resolve issues faster with greater confidence.

## Get Started Today

Headlamp Projects make Kubernetes simpler, and more application focused. Create a project, link the right namespaces, and give your team a clear, scoped space to collaborate and manage workloads without cluster-wide complexity.

Open Headlamp, select Projects, and start organizing your applications for faster onboarding, easier troubleshooting, and better team alignment.
