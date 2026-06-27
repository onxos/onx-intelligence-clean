/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class EvidenceService {
    /**
     * List evidence records
     * @returns any
     * @throws ApiError
     */
    public static evidenceControllerList(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/evidence',
        });
    }
    /**
     * Create evidence record
     * @returns any
     * @throws ApiError
     */
    public static evidenceControllerCreate(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/evidence',
        });
    }
}
