/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { LoginDto } from '../models/LoginDto';
import type { RegisterDto } from '../models/RegisterDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * Register new user
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static authControllerRegister(
        requestBody: RegisterDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/register',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Login and get JWT
     * @param requestBody
     * @returns any
     * @throws ApiError
     */
    public static authControllerLogin(
        requestBody: LoginDto,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/login',
            body: requestBody,
            mediaType: 'application/json',
        });
    }
    /**
     * Get current user profile
     * @returns any
     * @throws ApiError
     */
    public static authControllerMe(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/auth/me',
        });
    }
    /**
     * Revoke current session
     * @returns any
     * @throws ApiError
     */
    public static authControllerRevoke(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/auth/revoke',
        });
    }
    /**
     * List user devices
     * @returns any
     * @throws ApiError
     */
    public static authControllerDevices(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/auth/devices',
        });
    }
}
