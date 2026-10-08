import React from "react";
import { Trash2 } from "lucide-react";

export default function ConfirmDeleteModal({
  title = "Delete Items?",
  message = "Are you sure you want to delete these items? This action cannot be undone.",
  onConfirm,
  onClose,
  confirmText = "Delete",
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
            <Trash2 size={24} className="text-rose-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="mt-2 text-sm font-medium text-slate-500">{message}</p>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl bg-[#EC008C] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-pink-200 transition hover:bg-[#d4007d] active:scale-95"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
