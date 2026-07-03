---
title: HolmesGPT on Headlamp
sidebar_position: 9
---

# HolmesGPT on Headlamp

The HolmesGPT integration helps teams troubleshoot Kubernetes by turning cluster signals into clear explanations. It helps you understand what is happening and what to do next while you stay focused on the workload you are investigating.

This works well because the AI Assistant is context aware. It can use the cluster context you are already viewing to provide more relevant diagnostics.

HolmesGPT runs as an agent in your cluster. The AI Assistant connects to that agent to provide enhanced diagnostics and troubleshooting.

## Why Use HolmesGPT with Headlamp

Troubleshooting often requires pulling signals from many places. Logs show one symptom. Events show another. Resource state adds more detail, but it can still be hard to see the cause.

Headlamp already helps you inspect workloads and related resources. HolmesGPT adds reasoning on top of that context. It helps connect signals across resources and controller behavior so you can move from symptoms to likely causes faster.

This is most useful during active investigation. You can ask questions in plain language and get answers that match the workload and state you are looking at.

## Requirements

- You need Headlamp with the AI Assistant plugin installed and enabled.
- You need an AI provider configured for the AI Assistant. The plugin supports multiple providers and requires your provider credentials and endpoint information.
- You need permission to deploy resources into the cluster where you want to run the HolmesGPT agent.

## Configure the AI Assistant

Before you install HolmesGPT, configure the AI Assistant so it can run and answer prompts.

### Step 1: Install and enable the AI Assistant plugin

The AI Assistant is available as a Headlamp plugin. Once installed and enabled, it appears inside the Headlamp UI as a chat experience.

If you are using Headlamp Desktop, you can install plugins through the Plugin Catalog.

<img width="624" height="389" alt="A-plugins-catalog-highlight" src="https://github.com/user-attachments/assets/e49b1381-f3f4-4b57-861d-8e88b6d5bd45" />

### Step 2: Configure an AI provider

The AI Assistant supports multiple AI providers. In this instance, you must provide your own API keys and endpoint information for the provider you choose.

Once a provider is configured, the AI Assistant can respond to cluster questions and use cluster context to improve relevance.

<img width="624" height="387" alt="B-settings-plugin-highlight" src="https://github.com/user-attachments/assets/c80980a4-47ce-4977-922a-d0174b6d7ad3" />

<img width="624" height="386" alt="C-az-highlight" src="https://github.com/user-attachments/assets/70092b4c-edc7-41d9-8635-2038ad40c640" />

### Step 3: Confirm the AI Assistant works before adding HolmesGPT

Before installing HolmesGPT, confirm the assistant is functioning with your provider. A quick check is to ask a simple cluster question such as "Is my application healthy" or "What is wrong here" while viewing a workload.

When this works, you are ready to add HolmesGPT for deeper diagnostics.

## Install the HolmesGPT Agent

The AI Assistant connects to a HolmesGPT agent that runs in your cluster. The steps below assume you've already configured the AI Assistant.

### Step 1: Add the Robusta Helm repository

```bash
helm repo add robusta https://robusta-charts.storage.googleapis.com
helm repo update
```

This repository is used by the documented installation steps.

### Step 2: Create a values file

Create a file named `values.yaml`. The example below matches the plugin documentation pattern for Azure OpenAI.

```yaml
image: robustadev/holmes:0.19.1
additionalEnvVars:
  - name: AZURE_API_KEY
    value: ''
  - name: AZURE_API_BASE
    value: 'https://<your-azure-endpoint>.openai.azure.com'
  - name: AZURE_API_VERSION
    value: '2024-02-15-preview'

modelList:
  azure-gpt4:
    api_key: '{{ env.AZURE_API_KEY }}'
    model: azure/gpt-5
    api_base: '{{ env.AZURE_API_BASE }}'
    api_version: '{{ env.AZURE_API_VERSION }}'
```

If you use a different provider, you can still follow this same deployment flow and adjust the values for your provider.

### Step 3: Render the manifest and enable the AG UI server

The plugin documentation requires enabling the AG UI server so the AI Assistant can communicate with Holmes.

Render the chart to a file.

```bash
helm template holmesgpt robusta/holmes -f values.yaml > rendered.yaml
```

Open `rendered.yaml` and update the container command to the following value.

```yaml
command: ['python3', '-u', '/app/experimental/ag-ui/server-agui.py']
```

### Step 4: Apply the rendered manifest

```bash
kubectl apply -f rendered.yaml
```

## Use HolmesGPT in Headlamp

Once the agent is running, open Headlamp and use the AI Assistant to troubleshoot.

A good first test is to open a workload that looks unhealthy and ask a direct question. For example, you can ask what is wrong or why a pod is restarting. The AI Assistant is designed to use cluster context and provide troubleshooting help in natural language.

<img width="624" height="388" alt="D-chatbot-highlight" src="https://github.com/user-attachments/assets/081d3ba3-7140-43df-ad65-9def7e7d7f83" />

## Troubleshooting

### Headlamp cannot reach the HolmesGPT agent

Start by confirming the agent pods are running and ready.

The integration checks reachability through the Kubernetes Service proxy path. If there are no ready endpoints, the API server can return a 503 and the integration treats the agent as unavailable.

Also confirm you updated the container command to enable the AG UI server, since that is required for the documented integration path.

### HolmesGPT is running but answers seem limited

Confirm your AI provider configuration. The AI Assistant requires provider credentials and settings, and provider issues can affect response quality.

Also confirm the Holmes `values.yaml` provider settings match your intended provider and model configuration.

## Get Started

Install the HolmesGPT agent in your cluster, then open Headlamp and use the AI Assistant while investigating a workload. HolmesGPT helps turn signals into explanations so you can decide what to do next with less guesswork.
