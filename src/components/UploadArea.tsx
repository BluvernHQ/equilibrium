"use client";

import { useState, useRef } from "react";
import { CloudArrowUpIcon, CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { useSession } from "@/context/SessionContext";

export default function UploadArea() {
    const { uploadFile, isUploading, uploadStatus, uploadError, uploadProgress } = useSession();
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = async (selectedFile: File) => {
        await uploadFile(selectedFile);
    };

    return (
        <div
            className={`
        relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300
        flex flex-col items-center justify-center p-8 sm:p-12
        ${isDragging
                    ? "border-[#00A3AF] bg-[#00A3AF]/5"
                    : "border-gray-200 bg-white hover:border-[#00A3AF]/50 hover:bg-[#00A3AF]/5"
                }
        cursor-pointer
      `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
        >
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="audio/*,video/*"
                onChange={handleFileSelect}
            />

            <div className={`p-4 rounded-full mb-4 transition-all duration-300 ${
                isDragging ? 'scale-110' : ''
            } ${
                uploadStatus === "success" ? "bg-green-50" :
                uploadStatus === "error" ? "bg-red-50" :
                uploadStatus === "uploading" ? "bg-blue-50" :
                "bg-gray-50"
            }`}>
                {uploadStatus === "success" ? (
                    <CheckCircleIcon className="w-10 h-10 text-green-500" />
                ) : uploadStatus === "error" ? (
                    <XCircleIcon className="w-10 h-10 text-red-500" />
                ) : (
                    <CloudArrowUpIcon className={`w-10 h-10 ${
                        uploadStatus === "uploading" ? "text-blue-500 animate-pulse" : "text-[#00A3AF]"
                    }`} />
                )}
            </div>

            <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {uploadStatus === "uploading" && "Uploading to Storage..."}
                {uploadStatus === "success" && "Upload Successful!"}
                {uploadStatus === "error" && "Upload Failed"}
                {uploadStatus === "idle" && "Upload Session Media"}
            </h3>

            {uploadStatus === "uploading" && (
                <div className="w-full max-w-sm mb-4">
                    <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                        <div
                            className="bg-[#00A3AF] h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                        />
                    </div>
                    <p className="text-sm text-gray-600 text-center">{uploadProgress}%</p>
                </div>
            )}

            {uploadStatus === "error" && uploadError && (
                <div className="w-full max-w-sm mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-700 text-center">{uploadError}</p>
                </div>
            )}

            {uploadStatus === "success" && (
                <div className="w-full max-w-sm mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700 text-center">File uploaded successfully to storage!</p>
                </div>
            )}

            <p className="text-gray-500 text-center max-w-sm mb-6">
                {uploadStatus === "idle" && (
                    <>
                        Drag and drop your audio or video file here, or click to browse.
                        <br />
                        <span className="text-xs text-gray-400 mt-2 block">Supported formats: MP3, MP4, WAV, M4A</span>
                    </>
                )}
                {uploadStatus === "uploading" && "Please wait while your file is being uploaded..."}
                {uploadStatus === "success" && "Your file is now available in the Recordings page."}
                {uploadStatus === "error" && "Please try again or check your connection."}
            </p>

            <button 
                className={`px-6 py-2.5 rounded-lg font-medium shadow-lg transition-all transform hover:-translate-y-0.5 ${
                    uploadStatus === "uploading" 
                        ? "bg-gray-400 text-white cursor-not-allowed" 
                        : uploadStatus === "success"
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : uploadStatus === "error"
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-[#111827] text-white hover:bg-black hover:shadow-xl"
                }`}
                disabled={uploadStatus === "uploading"}
            >
                {uploadStatus === "uploading" && "Uploading..."}
                {uploadStatus === "success" && "Upload Complete"}
                {uploadStatus === "error" && "Try Again"}
                {uploadStatus === "idle" && "Browse Files"}
            </button>
        </div>
    );
}
