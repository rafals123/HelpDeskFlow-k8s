# HelpDeskFlow Kubernetes Deployment Notes

This document summarizes the Kubernetes deployment manifests prepared for the second project stage and explains the design choices required by the assignment.

## Scope

The application was deployed in a dedicated Kubernetes environment on Minikube. The manifest set covers:

- namespace
- deployments and statefulsets
- services
- ingress
- persistent storage
- configmaps and secrets
- probes

The manifests are stored in the [k8s](./k8s) directory.

## Namespace

The whole system is deployed into a dedicated namespace:

- [k8s/namespace.yaml](./k8s/namespace.yaml)

The namespace name is:

- `helpdeskflow`

This separation keeps the project resources isolated from other workloads running in the cluster. It also makes administration easier because pods, services, secrets, policies, and storage objects related to the system can be listed, filtered, and managed within one dedicated scope.

## Workload Objects

### Why both `Deployment` and `StatefulSet` are used

The system uses two workload types:

- `Deployment` for stateless application services
- `StatefulSet` for the PostgreSQL database

This split follows the runtime behavior of the components.

### `Deployment` objects

The following services use `Deployment`:

- [k8s/services/frontend.yaml](./k8s/services/frontend.yaml)
- [k8s/services/api-gateway.yaml](./k8s/services/api-gateway.yaml)
- [k8s/services/auth-service.yaml](./k8s/services/auth-service.yaml)
- [k8s/services/user-service.yaml](./k8s/services/user-service.yaml)
- [k8s/services/ticket-service.yaml](./k8s/services/ticket-service.yaml)
- [k8s/services/notification-service.yaml](./k8s/services/notification-service.yaml)
- [k8s/services/mailpit.yaml](./k8s/services/mailpit.yaml)

`Deployment` was selected for these components because they are stateless from the Kubernetes point of view. They do not require stable pod identity or dedicated persistent volume binding per replica. They can be recreated, rescheduled, and scaled horizontally without changing their application logic.

### Number of replicas

Replica counts were chosen as follows:

- `frontend`: `3`
- `api-gateway`: `3`
- `auth-service`: `3`
- `user-service`: `3`
- `ticket-service`: `3`
- `notification-service`: `3`
- `mailpit`: `1`

The first six services were intentionally scaled to three replicas because the final Minikube cluster is three-node. This makes scheduling policies meaningful and allows the project to demonstrate real replica distribution across nodes. Three replicas also provide basic high availability for stateless services.

`mailpit` stays at one replica because it is only a local development SMTP inbox used for demonstration and testing. High availability is not required for this auxiliary component.

### `StatefulSet` object

The database uses:

- [k8s/db/statefulset.yaml](./k8s/db/statefulset.yaml)

`StatefulSet` was selected for PostgreSQL because the database is stateful and requires:

- stable identity
- predictable startup behavior
- stable persistent storage attachment

Unlike the stateless services, PostgreSQL should not be treated as a freely replaceable replicated application container in this project. The database is therefore deployed as a single stateful instance with:

- `replicas: 1`

One replica was chosen because the project does not implement database clustering or replication. Running multiple PostgreSQL replicas without a dedicated replication architecture would not be correct.

### `DaemonSet`

No `DaemonSet` is used in this project.

This is intentional. None of the application components need to run exactly once on every node. `DaemonSet` would be more appropriate for node-level agents such as log shippers, monitoring agents, or CNI helpers, not for the business services implemented in HelpDeskFlow.

## Services

The following service manifests are used:

- [k8s/db/service.yaml](./k8s/db/service.yaml)
- [k8s/services/frontend.yaml](./k8s/services/frontend.yaml)
- [k8s/services/api-gateway.yaml](./k8s/services/api-gateway.yaml)
- [k8s/services/auth-service.yaml](./k8s/services/auth-service.yaml)
- [k8s/services/user-service.yaml](./k8s/services/user-service.yaml)
- [k8s/services/ticket-service.yaml](./k8s/services/ticket-service.yaml)
- [k8s/services/notification-service.yaml](./k8s/services/notification-service.yaml)
- [k8s/services/mailpit.yaml](./k8s/services/mailpit.yaml)

All application services use:

- `ClusterIP`

### Why `ClusterIP` was selected

`ClusterIP` was chosen because internal service-to-service communication should stay inside the cluster network:

- `api-gateway` talks to backend services
- `ticket-service` talks to `notification-service`
- backend services talk to PostgreSQL
- `notification-service` talks to Mailpit

This is the most appropriate default service type for microservices that should not be directly exposed outside the cluster.

The architecture intentionally avoids exposing backend internals such as:

- `auth-service`
- `user-service`
- `ticket-service`
- `notification-service`
- `db`

The `frontend` and `api-gateway` are also exposed as `ClusterIP` services because external access is handled at the ingress layer rather than through `NodePort` or external load balancers.

## External Access: Ingress

External access is configured with:

- [k8s/ingress/ingress.yaml](./k8s/ingress/ingress.yaml)

The project uses:

- `Ingress`

with the following hostnames:

- `helpdeskflow.local`
- `mailpit.helpdeskflow.local`

### Why `Ingress` was selected

`Ingress` was selected because it provides a clean HTTP entry point for the whole system and matches the microservice architecture well. Instead of exposing each component through separate external ports, the deployment uses host and path based routing:

- `http://helpdeskflow.local/` -> `frontend`
- `http://helpdeskflow.local/api` -> `api-gateway`
- `http://mailpit.helpdeskflow.local/` -> `mailpit`

This approach is more consistent with real Kubernetes deployments than exposing multiple `NodePort` services. It also clearly separates public entry points from internal-only services.

### Why `notification-service` is not exposed

`notification-service` is intentionally not routed by ingress and is not exposed publicly. It is an internal microservice called by `ticket-service` after status changes. This reduces the exposed attack surface and keeps the public API limited to the components that are actually used by end users.

### Local Minikube access

The project was tested locally on Minikube with the ingress addon enabled. Since the deployment uses local hostnames, the Windows `hosts` file was updated with:

- `127.0.0.1 helpdeskflow.local`
- `127.0.0.1 mailpit.helpdeskflow.local`

This is a normal local-development approach for ingress testing in Minikube.

## Persistent Storage: PV / PVC / StorageClass

Persistent database storage is defined through:

- [k8s/db/pvc.yaml](./k8s/db/pvc.yaml)
- [k8s/db/statefulset.yaml](./k8s/db/statefulset.yaml)

The project uses:

- `PersistentVolumeClaim`

for PostgreSQL data persistence.

### Why PVC is used

The database stores permanent business data:

- users
- cases
- comments
- case history
- notification logs

Because this data must survive pod recreation, it cannot rely on ephemeral container storage. The PostgreSQL pod therefore mounts persistent storage through a PVC.

### StorageClass

No custom `StorageClass` manifest was created.

The deployment relies on the default Minikube storage provisioning mechanism. This is acceptable for the scope of the project because the goal is to demonstrate persistent storage integration in a local Kubernetes cluster, not to build a custom storage backend. In practice, Minikube automatically provisions storage for the claim through its default storage class.

## ConfigMap and Secrets

Configuration manifests:

- [k8s/configmap.yaml](./k8s/configmap.yaml)
- [k8s/secret.yaml](./k8s/secret.yaml)

### `ConfigMap`

`ConfigMap` is used for non-sensitive configuration values such as:

- service ports
- internal service URLs
- database host and database name
- notification mode
- SMTP host and SMTP port

This keeps normal runtime configuration outside the container images and makes the deployment easier to adapt between environments.

### `Secret`

`Secret` is used for values that should not be stored as plain application constants inside the images, for example:

- database password
- JWT secret
- internal service token
- seed account passwords
- optional SMTP credentials

The Kubernetes manifests inject those values into pods through environment variables. This approach separates sensitive data from image build logic and supports safer configuration handling.

### Why environment variable injection was selected

The project uses environment-variable-based injection because:

- the existing services are already designed around environment configuration
- it is simple and readable for a course project
- it works consistently in Docker Compose and Kubernetes
- it keeps the container images reusable across environments

## Health and Readiness Probes

The workloads also define:

- `readinessProbe`
- `livenessProbe`

These probes are configured in the service manifests and in the database `StatefulSet`.

### Why probes are important

`readinessProbe` ensures that traffic is only sent to pods that are actually ready to serve requests.

`livenessProbe` allows Kubernetes to detect unhealthy containers and restart them automatically.

Backend services use the `/health` endpoint, the frontend uses `/`, and PostgreSQL uses `pg_isready`.

## Final Summary

The HelpDeskFlow deployment uses Kubernetes objects that match the real role of each component:

- dedicated namespace for isolation
- `Deployment` for stateless microservices
- `StatefulSet` for PostgreSQL
- `ClusterIP` services for internal communication
- `Ingress` for external HTTP access
- `PVC` for permanent database storage
- `ConfigMap` and `Secret` for runtime configuration injection

Additional scoring elements such as resource limits, network policies, and scheduling controls are described separately in:

- [README_Project_Kubernetes_Additional_Controls.md](./README_Project_Kubernetes_Additional_Controls.md)

These choices provide a consistent, secure, and technically justified deployment model for the project requirements.
