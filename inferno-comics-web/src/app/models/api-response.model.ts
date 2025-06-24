export class ApiResponse<T> {
    code: number; // HTTP status code
    message: string; // Response message
    data: T; // Generic type for additional data

    constructor(apiResponse: Partial<ApiResponse<T>> = {}) {
        this.code = apiResponse.code || 0;
        this.message = apiResponse.message || '';
        this.data = apiResponse.data!;
    }
}
