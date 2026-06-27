/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class WorkspaceService {
    /**
     * Get workspace home snapshot
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerHome(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workspace/home',
        });
    }
    /**
     * List projects (pending backend domain model)
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerProjects(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects',
        });
    }
    /**
     * Get project details (pending backend domain model)
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerProjectDetails(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/projects/{id}',
            path: {
                'id': id,
            },
        });
    }
    /**
     * List knowledge assets
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerKnowledge(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/knowledge/assets',
        });
    }
    /**
     * List sources and provenance records
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerSources(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/sources',
        });
    }
    /**
     * List agents (pending backend domain model)
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerAgents(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/agents',
        });
    }
    /**
     * List available models by provider
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerModels(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/models',
        });
    }
    /**
     * List provider evaluations
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerEvaluations(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/evaluations',
        });
    }
    /**
     * Get workspace report snapshot
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerReports(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/reports',
        });
    }
    /**
     * Get workspace monitoring snapshot
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerMonitoring(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/monitoring',
        });
    }
    /**
     * Get workspace/user settings snapshot
     * @returns any
     * @throws ApiError
     */
    public static workspaceControllerSettings(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/settings',
        });
    }
}
