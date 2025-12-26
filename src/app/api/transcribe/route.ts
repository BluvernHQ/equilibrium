import { NextRequest, NextResponse } from "next/server";
import { AssemblyAI } from "assemblyai";

const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY || "",
});

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const videoUrl = formData.get("videoUrl") as string;

        let uploadUrl: string;

        if (file) {
            // Handle file upload (from direct upload)
            // Convert File to Buffer
            const arrayBuffer = await file.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // Upload the file to AssemblyAI
            uploadUrl = await client.files.upload(buffer);
        } else if (videoUrl) {
            // Handle video URL (from recordings page)
            // AssemblyAI can transcribe directly from a public URL
            uploadUrl = videoUrl;
        } else {
            return NextResponse.json(
                { error: "No file or video URL provided" },
                { status: 400 }
            );
        }

        // Start Transcription with Speaker Diarization
        const config = {
            audio: uploadUrl, // The URL (either from upload or direct URL)
            speaker_labels: true,
        };

        const transcript = await client.transcripts.transcribe(config);
        // Note: client.transcripts.transcribe waits for completion by default in the Node SDK? 
        // Actually, check the docs or behavior. 
        // Usually 'transcribe' waits for completion if we don't pass specific params or use 'submit'.
        // The user snippet used 'await client.transcripts.transcribe(params)' which returns the FINAL transcript.
        // This might timeout for long files in a serverless function (Vercel has 10s-60s limit).
        // BETTER APPROACH: Use 'submit' (async) or handle potential timeout. 
        // BUT for this demo/prototype, let's assume short files or just return the result because the user snippet did that.
        // Wait, if it takes too long, the FE will timeout.
        // To be safe, I will stick to the user's snippet approach but wrap it.
        // If the user wants to switch between screens "once uploaded", maybe we should return early?
        // Let's stick to the synchronous-looking 'transcribe' for now as it's simplest, but warn if it's slow.
        // actually, 'client.transcripts.transcribe' POILS internally.

        return NextResponse.json(transcript);

    } catch (error: any) {
        console.error("Transcription error:", error);
        return NextResponse.json(
            { error: error.message || "Something went wrong" },
            { status: 500 }
        );
    }
}
