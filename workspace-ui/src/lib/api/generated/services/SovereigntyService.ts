/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SovereigntyService {
    /**
     * Evaluate sovereignty for intent
     * @returns any
     * @throws ApiError
     */
    public static sovereigntyControllerEvaluate(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/sovereignty/evaluate',
        });
    }
    /**
     * Get sovereignty report
     * @returns any
     * @throws ApiError
     */
    public static sovereigntyControllerReport(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/sovereignty/report',
        });
    }
}
