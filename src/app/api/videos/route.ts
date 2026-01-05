import { NextRequest, NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
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

export async function GET(req: NextRequest) {
    try {
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

        // List objects in the Equilibrium folder
        const command = new ListObjectsV2Command({
            Bucket: DO_SPACES_BUCKET,
            Prefix: "Equilibrium/",
        });

        const response = await s3Client.send(command);

        // Filter out speaker avatars and only include video/audio files
        const videoAudioExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv', '.wmv', '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma'];
        
        const filteredObjects = (response.Contents || []).filter((object) => {
            const key = object.Key || "";
            
            // Exclude files from speakers folder
            if (key.includes('/speakers/')) {
                return false;
            }
            
            // Only include video/audio files
            const fileName = key.split("/").pop() || "";
            const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
            return videoAudioExtensions.includes(extension);
        });

        // Format the response and generate presigned URLs
        const videos = await Promise.all(
            filteredObjects.map(async (object) => {
                const key = object.Key || "";
                const fileName = key.split("/").pop() || "";
                
                // Try to generate presigned URL (valid for 1 hour)
                try {
                    const getObjectCommand = new GetObjectCommand({
                        Bucket: DO_SPACES_BUCKET,
                        Key: key,
                    });
                    
                    const presignedUrl = await getSignedUrl(s3Client, getObjectCommand, {
                        expiresIn: 3600, // 1 hour
                    });

                    return {
                        key: key,
                        fileName: fileName,
                        url: presignedUrl,
                        size: object.Size || 0,
                        lastModified: object.LastModified?.toISOString() || new Date().toISOString(),
                    };
                } catch (error) {
                    // Fallback to public URL if presigned URL generation fails
                    console.error("Failed to generate presigned URL for", key, error);
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

                    return {
                        key: key,
                        fileName: fileName,
                        url: publicUrl,
                        size: object.Size || 0,
                        lastModified: object.LastModified?.toISOString() || new Date().toISOString(),
                    };
                }
            })
        );

        // Sort by last modified (newest first)
        videos.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

        return NextResponse.json({
            success: true,
            videos: videos,
            count: videos.length,
        });

    } catch (error: any) {
        console.error("List videos error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to list videos" },
            { status: 500 }
        );
    }
}

