export enum Type {
    INFO,
    WARNING,
    ERROR,
    SUCCESS,
    NONE
}

export class ApiResponse<T> {
    code: number;
    message: string;
    data: T | undefined;
    type: Type;
    timeMs: number;

    constructor(apiResponse: Partial<ApiResponse<T>> = {}) {
        this.code = apiResponse.code || 0;
        this.message = apiResponse.message || '';
        this.data = apiResponse.data || undefined;
        this.type = apiResponse.type || Type.NONE;
        this.timeMs = apiResponse.timeMs || 0;
    }
}
