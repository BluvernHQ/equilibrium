import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { handleError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Max upload size: 500 MB (must match upload route). */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const formatEndpoint = (
    endpoint: string | undefined,
    originEndpoint: string | undefined,
    bucket: string | undefined,
    region: string
): string => {
    if (endpoint) {
        let formatted = endpoint.replace(/^https?:\/\//, "");
        if (bucket && formatted.startsWith(`${bucket}.`)) {
            formatted = formatted.substring(bucket.length + 1);
        }
        return `https://${formatted}`;
    }
    if (originEndpoint) {
        let url = originEndpoint.replace(/^https?:\/\//, "");
        if (bucket && url.startsWith(`${bucket}.`)) {
            url = url.substring(bucket.length + 1);
        }
        return `https://${url}`;
    }
    return `https://${region}.digitaloceanspaces.com`;
};

const createS3Client = (endpoint: string) => {
    const DO_SPACES_KEY = process.env.DO_SPACES_KEY;
    const DO_SPACES_SECRET = process.env.DO_SPACES_SECRET;
    return new S3Client({
        endpoint,
        region: "us-east-1",
        forcePathStyle: false,
        credentials: {
            accessKeyId: DO_SPACES_KEY || "",
            secretAccessKey: DO_SPACES_SECRET || "",
        },
    });
};

/**
 * Returns a presigned PUT URL so the client can upload directly to Spaces.
 * This avoids sending the file through the server (no timeout, no proxy body limit).
 */
export async function POST(req: NextRequest) {
    try {
        const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT;
        const DO_SPACES_ORIGIN_ENDPOINT = process.env.DO_SPACES_ORIGIN_ENDPOINT;
        const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET;
        const DO_SPACES_REGION = process.env.DO_SPACES_REGION || "nyc3";

        if (
            (!DO_SPACES_ENDPOINT && !DO_SPACES_ORIGIN_ENDPOINT) ||
            !DO_SPACES_BUCKET ||
            !process.env.DO_SPACES_KEY ||
            !process.env.DO_SPACES_SECRET
        ) {
            return NextResponse.json(
                { error: "Missing required environment variables" },
                { status: 500 }
            );
        }

        const body = await req.json().catch(() => ({}));
        const fileName = body.fileName ?? body.name;
        const contentType = body.contentType ?? body.type ?? "video/mp4";
        const fileSize = body.fileSize ?? 0;

        if (!fileName || typeof fileName !== "string") {
            throw new ValidationError("fileName is required");
        }
        if (fileSize > MAX_UPLOAD_BYTES) {
            const maxMB = MAX_UPLOAD_BYTES / (1024 * 1024);
            throw new ValidationError(
                `File too large. Max ${maxMB} MB.`,
                { maxSizeMB: maxMB }
            );
        }

        const ext = fileName.split(".").pop() || "mp4";
        const baseName = fileName.substring(0, fileName.lastIndexOf(".")) || fileName;
        const sanitized = baseName.replace(/[^a-zA-Z0-9\s\-_]/g, "_").trim();
        const key = `Equilibrium/${sanitized}_${Date.now()}.${ext}`;

        const formattedEndpoint = formatEndpoint(
            DO_SPACES_ENDPOINT,
            DO_SPACES_ORIGIN_ENDPOINT,
            DO_SPACES_BUCKET,
            DO_SPACES_REGION
        );
        const s3Client = createS3Client(formattedEndpoint);

        const putCommand = new PutObjectCommand({
            Bucket: DO_SPACES_BUCKET,
            Key: key,
            ContentType: contentType,
        });
        const uploadUrl = await getSignedUrl(s3Client, putCommand, {
            expiresIn: 3600,
        });

        let publicUrl: string;
        if (DO_SPACES_ORIGIN_ENDPOINT) {
            const origin = DO_SPACES_ORIGIN_ENDPOINT.replace(/^https?:\/\//, "");
            publicUrl = `https://${origin}/${key}`;
        } else if (DO_SPACES_ENDPOINT) {
            const endpoint = DO_SPACES_ENDPOINT.replace(/^https?:\/\//, "");
            publicUrl = `https://${DO_SPACES_BUCKET}.${endpoint}/${key}`;
        } else {
            publicUrl = `https://${DO_SPACES_BUCKET}.${DO_SPACES_REGION}.digitaloceanspaces.com/${key}`;
        }

        return NextResponse.json({
            success: true,
            uploadUrl,
            key,
            publicUrl,
            fileName: key.split("/").pop(),
        });
    } catch (error: unknown) {
        if (error instanceof ValidationError) return handleError(error);
        logger.error(
            "Presign failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/upload/presign" }
        );
        return handleError(error);
    }
}
