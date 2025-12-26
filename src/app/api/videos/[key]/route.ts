import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ key: string }> }
) {
    try {
        // Decode the key from URL
        const { key: encodedKey } = await params;
        const key = decodeURIComponent(encodedKey);

        // Read environment variables
        const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT;
        const DO_SPACES_ORIGIN_ENDPOINT = process.env.DO_SPACES_ORIGIN_ENDPOINT;
        const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET;
        const DO_SPACES_REGION = process.env.DO_SPACES_REGION || "nyc3";

        // Validate environment variables
        if ((!DO_SPACES_ENDPOINT && !DO_SPACES_ORIGIN_ENDPOINT) || !DO_SPACES_BUCKET) {
            return NextResponse.json(
                { error: "Missing required environment variables" },
                { status: 500 }
            );
        }

        // Format the endpoint
        const formattedEndpoint = formatEndpoint(DO_SPACES_ENDPOINT, DO_SPACES_ORIGIN_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_REGION);
        
        // Create S3 client
        const s3Client = createS3Client(formattedEndpoint);

        // Generate presigned URL (valid for 1 hour)
        const getObjectCommand = new GetObjectCommand({
            Bucket: DO_SPACES_BUCKET,
            Key: key,
        });
        
        const presignedUrl = await getSignedUrl(s3Client, getObjectCommand, {
            expiresIn: 3600, // 1 hour
        });

        return NextResponse.json({
            success: true,
            url: presignedUrl,
        });

    } catch (error: any) {
        console.error("Get video URL error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to get video URL" },
            { status: 500 }
        );
    }
}

