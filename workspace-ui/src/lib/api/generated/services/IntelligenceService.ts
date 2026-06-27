/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class IntelligenceService {
    /**
     * Create intelligence object
     * @returns any
     * @throws ApiError
     */
    public static intelligenceControllerCreate(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/intelligence',
        });
    }
    /**
     * List intelligence objects
     * @returns any
     * @throws ApiError
     */
    public static intelligenceControllerList(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/intelligence',
        });
    }
    /**
     * Get intelligence statistics
     * @returns any
     * @throws ApiError
     */
    public static intelligenceControllerStats(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/intelligence/stats',
        });
    }
    /**
     * Get single intelligence object
     * @param id
     * @returns any
     * @throws ApiError
     */
    public static intelligenceControllerGet(
        id: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/intelligence/{id}',
            path: {
                'id': id,
            },
        });
    }
}
