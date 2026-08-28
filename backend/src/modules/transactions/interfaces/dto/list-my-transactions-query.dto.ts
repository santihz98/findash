import { PaginationQueryDto } from './pagination-query.dto';

// GET /transactions/me — sin filtros propios (el enunciado de RF-02 solo
// pide filtros de status/fecha para la vista de auditoría del ADMIN, ver
// ListTransactionsQueryDto), así que hoy es literalmente la paginación base.
export class ListMyTransactionsQueryDto extends PaginationQueryDto {}
