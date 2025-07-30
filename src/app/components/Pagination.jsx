'use client';
export function Pagination({ page, setPage, hasMore }) {
    return (
        <div className="flex justify-center space-x-4 mt-4">
            <button disabled={page<=1} onClick={()=>setPage(page-1)} className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50">Prev</button>
            <span>Page {page}</span>
            <button disabled={!hasMore} onClick={()=>setPage(page+1)} className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50">Next</button>
        </div>
    )
}
