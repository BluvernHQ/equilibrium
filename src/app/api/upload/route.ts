import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { handleError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import os from "os";

const execPromise = promisify(exec);

// Increase timeout for large file uploads (5 minutes)
export const maxDuration = 300;
export const runtime = 'nodejs';

/** Max upload size: 500 MB. Larger files may hit timeouts or proxy limits (e.g. nginx client_max_body_size). */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

// Format endpoint URL for S3 client
const formatEndpoint = (endpoint: string | undefined, originEndpoint: string | undefined, bucket: string | undefined, region: string): string => {
    if (endpoint) {
        let formatted = endpoint.replace(/^https?:\/\//, '');
        if (bucket && formatted.startsWith(`${bucket}.`)) {
            formatted = formatted.substring(bucket.length + 1);
        }
        return `https://${formatted}`;
    }
    
    if (originEndpoint) {
        let url = originEndpoint.replace(/^https?:\/\//, '');
        if (bucket && url.startsWith(`${bucket}.`)) {
            url = url.substring(bucket.length + 1);
        }
        return `https://${url}`;
    }
    
    return `https://${region}.digitaloceanspaces.com`;
};

// Create S3 client function
const createS3Client = (endpoint: string) => {
    const DO_SPACES_KEY = process.env.DO_SPACES_KEY;
    const DO_SPACES_SECRET = process.env.DO_SPACES_SECRET;

    return new S3Client({
        endpoint: endpoint,
        region: "us-east-1",
        forcePathStyle: false,
        credentials: {
            accessKeyId: DO_SPACES_KEY || "",
            secretAccessKey: DO_SPACES_SECRET || "",
        },
    });
};

export async function POST(req: NextRequest) {
    try {
        // Read environment variables at request time
        const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT;
        const DO_SPACES_ORIGIN_ENDPOINT = process.env.DO_SPACES_ORIGIN_ENDPOINT;
        const DO_SPACES_KEY = process.env.DO_SPACES_KEY;
        const DO_SPACES_SECRET = process.env.DO_SPACES_SECRET;
        const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET;
        const DO_SPACES_REGION = process.env.DO_SPACES_REGION || "nyc3";

        // Validate environment variables
        if ((!DO_SPACES_ENDPOINT && !DO_SPACES_ORIGIN_ENDPOINT) || !DO_SPACES_KEY || !DO_SPACES_SECRET || !DO_SPACES_BUCKET) {
            const missing = [];
            if (!DO_SPACES_ENDPOINT && !DO_SPACES_ORIGIN_ENDPOINT) {
                missing.push("DO_SPACES_ENDPOINT or DO_SPACES_ORIGIN_ENDPOINT");
            }
            if (!DO_SPACES_KEY) missing.push("DO_SPACES_KEY");
            if (!DO_SPACES_SECRET) missing.push("DO_SPACES_SECRET");
            if (!DO_SPACES_BUCKET) missing.push("DO_SPACES_BUCKET");
            
            return NextResponse.json(
                { error: `Missing required environment variables: ${missing.join(", ")}` },
                { status: 500 }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 }
            );
        }

        if (file.size > MAX_UPLOAD_BYTES) {
            const maxMB = MAX_UPLOAD_BYTES / (1024 * 1024);
            throw new ValidationError(
                `File is too large. Maximum size is ${maxMB} MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
                { maxSizeMB: maxMB, actualSizeMB: (file.size / (1024 * 1024)).toFixed(2) }
            );
        }

        console.log("Received file upload request:", {
            fileName: file.name,
            fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
            fileType: file.type,
        });

        // Convert File to Buffer
        console.log("Converting file to buffer...");
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log("Buffer created, size:", `${(buffer.length / (1024 * 1024)).toFixed(2)} MB`);

        // Use original filename with timestamp suffix to ensure uniqueness
        const originalFileName = file.name;
        let fileExtension = (originalFileName.split('.').pop() || 'mp4').toLowerCase();
        let baseName = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || originalFileName;
        let contentType = file.type;
        let finalBuffer = buffer;

        // MTS/M2TS Conversion Logic
        if (fileExtension === 'mts' || fileExtension === 'm2ts') {
            console.log(`Detected ${fileExtension.toUpperCase()} file, starting conversion to MP4...`);
            const tempId = uuidv4();
            const inputPath = path.join(os.tmpdir(), `${tempId}.${fileExtension}`);
            const outputPath = path.join(os.tmpdir(), `${tempId}.mp4`);

            try {
                // Write original buffer to temp file
                await writeFile(inputPath, buffer);
                console.log(`Temp input file created: ${inputPath}`);

                // Convert to MP4 using ffmpeg
                // -preset ultrafast: prioritized speed over file size/quality for quick turnaround
                // -c:v libx264: H.264 video codec for wide browser compatibility
                // -c:a aac: AAC audio codec
                const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:v libx264 -preset ultrafast -crf 28 -c:a aac -b:a 128k -y "${outputPath}"`;
                console.log(`Running ffmpeg: ${ffmpegCmd}`);
                
                const { stdout, stderr } = await execPromise(ffmpegCmd);
                console.log("ffmpeg conversion completed");

                // Read converted file back to buffer
                finalBuffer = await readFile(outputPath);
                console.log(`Converted buffer size: ${(finalBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

                // Update metadata for upload
                fileExtension = 'mp4';
                contentType = 'video/mp4';
                // Adjust baseName to indicate it was converted
                baseName = `${baseName}_converted`;
            } catch (convError) {
                console.error("FFmpeg conversion failed:", convError);
                // We'll continue with the original file if conversion fails, 
                // though it might not play in the browser.
                logger.error("MTS conversion failed, falling back to original file", convError as Error);
            } finally {
                // Cleanup temp files
                try {
                    await unlink(inputPath).catch(() => {});
                    await unlink(outputPath).catch(() => {});
                    console.log("Temp conversion files cleaned up");
                } catch (cleanupError) {
                    console.error("Failed to cleanup temp files:", cleanupError);
                }
            }
        }

        // Sanitize filename: remove special characters, keep only alphanumeric, spaces, hyphens, underscores
        const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9\s\-_]/g, '_').trim();
        
        // Add timestamp to ensure uniqueness
        const timestamp = Date.now();
        const fileName = `${sanitizedBaseName}_${timestamp}.${fileExtension}`;
        const key = `Equilibrium/${fileName}`;

        // Format the endpoint for S3 client
        const formattedEndpoint = formatEndpoint(DO_SPACES_ENDPOINT, DO_SPACES_ORIGIN_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_REGION);
        
        logger.debug("S3 client configuration", {
            endpoint: formattedEndpoint,
            region: DO_SPACES_REGION,
            bucket: DO_SPACES_BUCKET,
        });

        const s3Client = createS3Client(formattedEndpoint);

        logger.info("Starting S3 upload", { bucket: DO_SPACES_BUCKET, key });
        const command = new PutObjectCommand({
            Bucket: DO_SPACES_BUCKET,
            Key: key,
            Body: finalBuffer,
            ContentType: contentType,
            ACL: "public-read", // Try to make file publicly accessible
        });

        try {
            await s3Client.send(command);
            console.log("S3 upload completed successfully with public access");
        } catch (aclError: any) {
            // If ACL fails, upload without it (files will be private, use presigned URLs)
            if (aclError.Code === "NotImplemented" || aclError.Code === "InvalidArgument") {
                console.log("ACL not supported, uploading as private file");
                const privateCommand = new PutObjectCommand({
                    Bucket: DO_SPACES_BUCKET,
                    Key: key,
                    Body: finalBuffer,
                    ContentType: contentType,
                });
                await s3Client.send(privateCommand);
                console.log("S3 upload completed successfully (private file)");
            } else {
                throw aclError;
            }
        }

        // Construct the public URL
        let publicUrl: string;
        if (DO_SPACES_ORIGIN_ENDPOINT) {
            const origin = DO_SPACES_ORIGIN_ENDPOINT.replace(/^https?:\/\//, '');
            publicUrl = `https://${origin}/${key}`;
        } else if (DO_SPACES_ENDPOINT) {
            const endpoint = DO_SPACES_ENDPOINT.replace(/^https?:\/\//, '');
            publicUrl = `https://${DO_SPACES_BUCKET}.${endpoint}/${key}`;
        } else {
            publicUrl = `https://${DO_SPACES_BUCKET}.${DO_SPACES_REGION}.digitaloceanspaces.com/${key}`;
        }

        // Don't save video to database here - will be saved when transcribing
        // Return video information for later use
        return NextResponse.json({
            success: true,
            url: publicUrl,
            key: key,
            fileName: fileName,
            // Include video metadata for later database save
            videoMetadata: {
                fileName: fileName, // Use the new filename (with .mp4)
                fileKey: key,
                fileUrl: publicUrl,
                fileSize: finalBuffer.length,
            },
        });

    } catch (error: unknown) {
        if (error instanceof ValidationError) {
            return handleError(error);
        }
        const err = error as { message?: string; Code?: string; code?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
        logger.error(
            "Upload failed",
            error instanceof Error ? error : new Error(String(error)),
            {
                path: "/api/upload",
                code: err.Code || err.code,
                statusCode: err.$metadata?.httpStatusCode,
                requestId: err.$metadata?.requestId,
            }
        );
        return handleError(error);
    }
}

