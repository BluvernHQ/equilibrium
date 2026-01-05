import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

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
        // Read environment variables
        const DO_SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT;
        const DO_SPACES_ORIGIN_ENDPOINT = process.env.DO_SPACES_ORIGIN_ENDPOINT;
        const DO_SPACES_KEY = process.env.DO_SPACES_KEY;
        const DO_SPACES_SECRET = process.env.DO_SPACES_SECRET;
        const DO_SPACES_BUCKET = process.env.DO_SPACES_BUCKET;
        const DO_SPACES_REGION = process.env.DO_SPACES_REGION || "nyc3";

        // Validate environment variables
        if ((!DO_SPACES_ENDPOINT && !DO_SPACES_ORIGIN_ENDPOINT) || !DO_SPACES_KEY || !DO_SPACES_SECRET || !DO_SPACES_BUCKET) {
            return NextResponse.json(
                { error: "Missing required environment variables for Digital Ocean Spaces" },
                { status: 500 }
            );
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const speakerName = formData.get("speakerName") as string | null;
        const videoId = formData.get("videoId") as string | null;

        if (!file) {
            return NextResponse.json(
                { error: "No file provided" },
                { status: 400 }
            );
        }

        // Validate file type (images only)
        if (!file.type.startsWith('image/')) {
            return NextResponse.json(
                { error: "File must be an image" },
                { status: 400 }
            );
        }

        // Convert File to Buffer
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate unique filename for speaker avatar
        const fileExtension = file.name.split('.').pop() || 'jpg';
        const sanitizedName = speakerName ? speakerName.replace(/[^a-zA-Z0-9\s\-_]/g, '_').trim() : 'speaker';
        const timestamp = Date.now();
        const uniqueId = uuidv4().substring(0, 8);
        const fileName = `speaker_${sanitizedName}_${timestamp}_${uniqueId}.${fileExtension}`;
        const key = `Equilibrium/speakers/${fileName}`;

        // Format the endpoint for S3 client
        const formattedEndpoint = formatEndpoint(DO_SPACES_ENDPOINT, DO_SPACES_ORIGIN_ENDPOINT, DO_SPACES_BUCKET, DO_SPACES_REGION);
        
        // Create S3 client
        const s3Client = createS3Client(formattedEndpoint);

        // Upload to Digital Ocean Spaces
        const command = new PutObjectCommand({
            Bucket: DO_SPACES_BUCKET,
            Key: key,
            Body: buffer,
            ContentType: file.type,
            ACL: "public-read", // Try to make file publicly accessible
        });

        try {
            await s3Client.send(command);
            console.log("Speaker avatar uploaded successfully with public access");
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
                console.log("Speaker avatar uploaded successfully (private file)");
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

        return NextResponse.json({
            success: true,
            url: publicUrl,
            key: key,
            fileName: fileName,
        });

    } catch (error: any) {
        console.error("Speaker avatar upload error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to upload speaker avatar" },
            { status: 500 }
        );
    }
}

