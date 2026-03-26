import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const runtime = "nodejs";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ videoId: string }> }
) {
    try {
        const { videoId } = await params;

        // Load video + latest transcript blocks
        // @ts-ignore - Prisma types generated at runtime
        const transcript = await prisma.transcript.findFirst({
            where: { video_id: videoId },
            orderBy: { version: "desc" },
            include: {
                video: {
                    select: {
                        fileName: true,
                    },
                },
                blocks: {
                    orderBy: { order_index: "asc" },
                },
            },
        });

        if (!transcript) {
            throw new NotFoundError("Transcript not found", "transcript");
        }

        const videoTitle =
            transcript.video?.fileName || `Session ${transcript.video_id}`;

        // Build a simple structured text version
        const lines: string[] = [];
        lines.push(videoTitle);
        lines.push("");

        for (const block of transcript.blocks as any[]) {
            const start = formatTime(block.start_time_seconds);
            const end = formatTime(block.end_time_seconds);
            const speaker = block.speaker_label || "Speaker";
            lines.push(`${speaker}  [${start} - ${end}]`);
            lines.push(block.text || "");
            lines.push("");
        }

        const pdfBuffer = await createPdfBuffer(videoTitle, lines.join("\n"));

        return new NextResponse(new Uint8Array(pdfBuffer), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="${sanitizeFilename(
                    `${videoTitle || "transcript"}.pdf`
                )}"`,
            },
        });
    } catch (error: unknown) {
        if (error instanceof NotFoundError) {
            return handleError(error);
        }

        logger.error(
            "Export transcript PDF failed",
            error instanceof Error ? error : new Error(String(error)),
            { path: "/api/transcriptions/[videoId]/export" }
        );
        return handleError(error);
    }
}

async function createPdfBuffer(title: string, body: string): Promise<Buffer> {
    const safeTitle = sanitizePdfText(title);
    const safeBody = sanitizePdfText(body);

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage();

    const { width, height } = page.getSize();
    const margin = 50;
    const fontSizeTitle = 18;
    const fontSizeBody = 10;

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    let cursorY = height - margin;

    // Title
    const titleWidth = font.widthOfTextAtSize(safeTitle, fontSizeTitle);
    page.drawText(safeTitle, {
        x: (width - titleWidth) / 2,
        y: cursorY,
        size: fontSizeTitle,
        font,
        color: rgb(0, 0, 0),
    });

    cursorY -= fontSizeTitle + 20;

    const maxLineWidth = width - margin * 2;

    const drawParagraph = (text: string) => {
        const lines = wrapText(text, font, fontSizeBody, maxLineWidth);
        for (const line of lines) {
            if (cursorY < margin) {
                page = pdfDoc.addPage();
                cursorY = page.getSize().height - margin;
            }
            page.drawText(line, {
                x: margin,
                y: cursorY,
                size: fontSizeBody,
                font,
                color: rgb(0.1, 0.1, 0.1),
            });
            cursorY -= fontSizeBody + 4;
        }
        cursorY -= 4;
    };

    safeBody.split("\n").forEach((paragraph) => {
        if (paragraph.trim().length === 0) {
            cursorY -= fontSizeBody;
        } else {
            drawParagraph(paragraph);
        }
    });

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

function wrapText(
    text: string,
    font: any,
    size: number,
    maxWidth: number
): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, size);
        if (testWidth <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    }
    if (currentLine) lines.push(currentLine);
    return lines;
}

function formatTime(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
        return "--:--";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9_\-\.]+/g, "_");
}

function sanitizePdfText(input: string): string {
    // pdf-lib standard fonts use WinAnsi encoding (not full Unicode).
    // Normalize common unicode punctuation and currency symbols, and drop the rest to avoid 500s.
    const normalized = input
        .replaceAll("\u20B9", "INR") // ₹
        .replaceAll("\u2018", "'")
        .replaceAll("\u2019", "'")
        .replaceAll("\u201C", '"')
        .replaceAll("\u201D", '"')
        .replaceAll("\u2013", "-")
        .replaceAll("\u2014", "-")
        .replaceAll("\u2026", "...")
        .replaceAll("\u00A0", " ");

    // Keep basic ASCII + Latin-1; replace everything else with '?'
    return normalized.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

