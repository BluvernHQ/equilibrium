import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

// Increase timeout for large file uploads (5 minutes)
export const maxDuration = 300;
export const runtime = 'nodejs';

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
        const fileExtension = originalFileName.split('.').pop() || 'mp4';
        const baseName = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || originalFileName;
        
        // Sanitize filename: remove special characters, keep only alphanumeric, spaces, hyphens, underscores
        const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9\s\-_]/g, '_').trim();
        
        // Add timestamp to ensure uniqueness
        const timestamp = Date.now();
        const fileName = `${sanitizedBaseName}_${timestamp}.${fileExtension}`;
        const key = `Equilibrium/${fileName}`;

        // Format the endpoint for S3 client
        const formattedEndpoint = formatEndpoint(DO_SPACES_ENDPOINT, DO_SPACES_ORIGIN_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_REGION);
        
        console.log("S3 Client Configuration:", {
            endpoint: formattedEndpoint,
            region: DO_SPACES_REGION,
            bucket: DO_SPACES_BUCKET,
            hasOriginEndpoint: !!DO_SPACES_ORIGIN_ENDPOINT,
        });
        
        // Create S3 client
        const s3Client = createS3Client(formattedEndpoint);

        // Upload to Digital Ocean Spaces
        console.log("Starting S3 upload...", { bucket: DO_SPACES_BUCKET, key });
        const command = new PutObjectCommand({
            Bucket: DO_SPACES_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: file.type,
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
                    Body: buffer,
                    ContentType: file.type,
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
                fileName: file.name,
                fileKey: key,
                fileUrl: publicUrl,
                fileSize: file.size,
            },
        });

    } catch (error: any) {
        console.error("Upload error details:", {
            message: error.message,
            name: error.name,
            code: error.Code || error.code,
            statusCode: error.$metadata?.httpStatusCode,
            requestId: error.$metadata?.requestId,
        });
        
        let errorMessage = "Failed to upload file";
        if (error.Code) {
            errorMessage = `S3 Error (${error.Code}): ${error.message || "Unknown error"}`;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}

