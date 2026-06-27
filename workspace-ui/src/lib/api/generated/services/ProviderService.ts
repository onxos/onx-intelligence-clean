/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProviderService {
    /**
     * List all providers
     * @returns any
     * @throws ApiError
     */
    public static providerControllerList(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/providers',
        });
    }
    /**
     * Evaluate provider via ISES
     * @returns any
     * @throws ApiError
     */
    public static providerControllerEvaluate(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/providers/evaluate',
        });
    }
}
