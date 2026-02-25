export interface PaginationData<T = any> {
    items: T[];
    total: number;
    page: number;
    per_page: number;
    pages: number;
    prev: number | null;
    next: number | null;
    has_prev: boolean;
    has_next: boolean;
}
