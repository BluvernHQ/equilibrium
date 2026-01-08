import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Helper function to extract fileKey from Digital Ocean Spaces URL
function extractFileKeyFromUrl(url: string): string | null {
    try {
        // Digital Ocean Spaces URLs can be in different formats:
        // 1. https://bucket.region.digitaloceanspaces.com/Equilibrium/filename.mp4
        // 2. https://custom-domain.com/Equilibrium/filename.mp4
        // 3. Presigned URLs with query parameters
        
        const urlObj = new URL(url);
        let path = urlObj.pathname;
        
        // Remove leading slash
        if (path.startsWith('/')) {
            path = path.substring(1);
        }
        
        // Check if path starts with "Equilibrium/"
        if (path.startsWith('Equilibrium/')) {
            return path; // Return the full key including "Equilibrium/"
        }
        
        // If not, try to find "Equilibrium/" in the path
        const equilibriumIndex = path.indexOf('Equilibrium/');
        if (equilibriumIndex !== -1) {
            return path.substring(equilibriumIndex);
        }
        
        // If still not found, return the path as-is (might be just the filename)
        // In this case, prepend "Equilibrium/"
        if (path) {
            return `Equilibrium/${path}`;
        }
        
        return null;
    } catch (error) {
        console.error("Error extracting fileKey from URL:", error);
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { fileUrl } = body;

        if (!fileUrl) {
            return NextResponse.json(
                { error: "Missing required field: fileUrl" },
                { status: 400 }
            );
        }

        // Extract fileKey from URL
        const fileKey = extractFileKeyFromUrl(fileUrl);
        if (!fileKey) {
            return NextResponse.json(
                { error: "Could not extract fileKey from URL" },
                { status: 400 }
            );
        }

        // Extract fileName from fileKey
        const fileName = fileKey.split('/').pop() || fileKey;

        // Extract canonical URL (without query parameters) for source_url
        const canonicalUrl = fileUrl.split('?')[0];

        // Check if video already exists by fileKey
        // Access Prisma models dynamically
        const prismaClient = prisma as any;
        if (!prismaClient) {
            throw new Error("Prisma client is not initialized. Please check server logs.");
        }
        
        if (typeof prismaClient.video === 'undefined') {
            console.error("Prisma client state:", {
                hasPrisma: !!prismaClient,
                prismaKeys: prismaClient ? Object.keys(prismaClient).filter(k => !k.startsWith('$') && !k.startsWith('_')).slice(0, 10) : [],
                prismaType: typeof prismaClient,
            });
            throw new Error("Database not connected. Prisma client missing 'video' model. Please ensure your database is set up and migrations are run. See DATABASE_SETUP.md for instructions.");
        }
        
        const existingVideo = await prismaClient.video.findUnique({
            where: { fileKey },
        });

        if (existingVideo) {
            return NextResponse.json({
                success: true,
                video: {
                    ...existingVideo,
                    fileSize: existingVideo.fileSize?.toString() || "0",
                },
            });
        }

        // Create new video record (just a reference to the bucket URL)
        const video = await prismaClient.video.create({
            data: {
                // Required fields
                source_type: "s3", // Digital Ocean Spaces is S3-compatible
                source_url: canonicalUrl,
                // Legacy fields (for backward compatibility)
                fileName,
                fileKey,
                fileUrl,
                fileSize: BigInt(0), // Size unknown, set to 0
            },
        });

        return NextResponse.json({
            success: true,
            video: {
                ...video,
                fileSize: video.fileSize.toString(),
            },
        });

    } catch (error: any) {
        console.error("Create video from URL error:", error);
        
        // Log full error details for debugging
        console.error("Error details:", {
            message: error.message,
            stack: error.stack,
            name: error.name,
        });
        
        // Return proper JSON error response
        return NextResponse.json(
            { 
                error: error.message || "Failed to create video record",
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            },
            { status: 500 }
        );
    }
}

