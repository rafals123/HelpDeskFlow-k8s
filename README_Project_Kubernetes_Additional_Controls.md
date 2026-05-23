# HelpDeskFlow Kubernetes Additional Controls

This document describes the additional Kubernetes mechanisms included in the project beyond the mandatory workload and service manifests. These controls improve operational quality, security, and deployment behavior in the cluster.

## Scope

The assignment listed three optional but strongly recommended mechanisms:

- resource limits
- network policy
- scheduling controls

All three were implemented in the project and are summarized below.

## Resource Limits

Resource constraints were defined directly in the workload manifests for the application services and database.

The configuration is present in:

- [k8s/services/frontend.yaml](./k8s/services/frontend.yaml)
- [k8s/services/api-gateway.yaml](./k8s/services/api-gateway.yaml)
- [k8s/services/auth-service.yaml](./k8s/services/auth-service.yaml)
- [k8s/services/user-service.yaml](./k8s/services/user-service.yaml)
- [k8s/services/ticket-service.yaml](./k8s/services/ticket-service.yaml)
- [k8s/services/notification-service.yaml](./k8s/services/notification-service.yaml)
- [k8s/services/mailpit.yaml](./k8s/services/mailpit.yaml)
- [k8s/db/statefulset.yaml](./k8s/db/statefulset.yaml)

### Why resource requests and limits were added

Resource requests and limits were defined to achieve three goals:

- prevent a single container from consuming disproportionate CPU or memory
- make pod scheduling more predictable
- reflect good deployment practice even in a local Minikube cluster

Requests provide the scheduler with a minimum resource expectation for each pod. Limits cap the maximum CPU and memory a container may use. This is especially useful in a multi-service system where several pods run simultaneously and compete for limited local cluster resources.

### Why this matters in HelpDeskFlow

The project contains multiple backend services, a frontend, PostgreSQL, and Mailpit. Without resource boundaries, accidental spikes or misbehaving containers could affect unrelated components. By adding requests and limits, the deployment becomes more stable and easier to reason about.

## Network Policy

Network segmentation is defined in:

- [k8s/networkpolicy](./k8s/networkpolicy)

The implemented manifests include:

- default deny policy
- DNS egress allow policy
- service-specific ingress and egress rules
- database access restrictions
- Mailpit access restrictions

### Why network policy was added

The application architecture clearly distinguishes between:

- public entry points
- internal service-to-service calls
- database-only communication paths

`NetworkPolicy` was added to enforce that architecture at the cluster network level.

Instead of allowing every pod to talk to every other pod, the project explicitly permits only the required communication paths.

### Implemented communication model

The policies allow the following traffic:

- ingress controller -> frontend
- ingress controller -> api-gateway
- api-gateway -> auth-service
- api-gateway -> user-service
- api-gateway -> ticket-service
- ticket-service -> notification-service
- auth-service -> database
- user-service -> database
- ticket-service -> database
- notification-service -> database
- notification-service -> mailpit
- all pods -> kube-dns for DNS resolution

Everything else is denied by default.

### Why this is a good fit for the project

This model matches the intended system design:

- `notification-service` is internal-only
- PostgreSQL is not reachable from public-facing components
- backend services are not unnecessarily exposed to each other
- ingress traffic is limited to the components that should be publicly reachable

The final cluster was deployed with Calico, so the network policies are not just declarative manifests. They are actually enforceable in the running environment.

## Scheduling Controls

Scheduling-related controls were added to the stateless workloads.

The project uses:

- `topologySpreadConstraints`
- `podAntiAffinity`

### Cluster layout

The final Minikube cluster is three-node. This was done intentionally so that scheduling behavior can be demonstrated in a meaningful way instead of only described theoretically.

The cluster nodes are used to distribute replicas of the stateless services:

- `frontend`
- `api-gateway`
- `auth-service`
- `user-service`
- `ticket-service`
- `notification-service`

Each of these services runs with:

- `replicas: 3`

### Topology spread constraints

`topologySpreadConstraints` were added to the stateless services to distribute replicas as evenly as possible across cluster nodes.

This helps avoid placing all replicas of one service on the same node. In practical terms, this increases resilience against single-node failure and improves the overall deployment structure.

### Pod anti-affinity

Soft `podAntiAffinity` was added for:

- `frontend`
- `api-gateway`

These two components are the main user-facing entry points of the system. They were treated as the most important public access layers, so the scheduler is instructed to avoid placing multiple replicas of the same component on one node when possible.

### Why these mechanisms were selected

The goal was to show a realistic but still understandable approach:

- `topologySpreadConstraints` provide balanced placement for all stateless services
- `podAntiAffinity` adds extra protection for the most critical entry-point components

This makes the deployment more convincing than using replica counts alone.

## Final Summary

The optional controls were implemented to improve the quality of the deployment in three areas:

- resource management
- traffic isolation
- replica placement

Together they make the project more secure, more predictable, and better aligned with real Kubernetes deployment practices.
