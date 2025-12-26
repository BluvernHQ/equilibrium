import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE - Remove all tags from the database
export async function DELETE(req: NextRequest) {
    try {
        console.log('Starting to delete all tags...');

        // Delete in order to respect foreign key constraints
        // Note: Due to cascade deletes, deleting MasterTag will automatically delete
        // PrimaryTag, BranchTag, SecondaryTag, and TagImpression
        
        // First, get counts for reporting
        // @ts-ignore
        const tagImpressionCount = await prisma.tagImpression.count();
        // @ts-ignore
        const masterTagCount = await prisma.masterTag.count();
        // @ts-ignore
        const primaryTagCount = await prisma.primaryTag.count();
        // @ts-ignore
        const secondaryTagCount = await prisma.secondaryTag.count();
        // @ts-ignore
        const branchTagCount = await prisma.branchTag.count();

        console.log(`Found ${tagImpressionCount} tag impressions`);
        console.log(`Found ${masterTagCount} master tags`);
        console.log(`Found ${primaryTagCount} primary tags`);
        console.log(`Found ${secondaryTagCount} secondary tags`);
        console.log(`Found ${branchTagCount} branch tags`);

        // Delete all tag impressions first (they reference tags)
        // @ts-ignore
        const deletedImpressions = await prisma.tagImpression.deleteMany({});
        console.log(`Deleted ${deletedImpressions.count} tag impressions`);

        // Delete secondary tags (they reference primary tags)
        // @ts-ignore
        const deletedSecondary = await prisma.secondaryTag.deleteMany({});
        console.log(`Deleted ${deletedSecondary.count} secondary tags`);

        // Delete primary tags (they reference master tags)
        // @ts-ignore
        const deletedPrimary = await prisma.primaryTag.deleteMany({});
        console.log(`Deleted ${deletedPrimary.count} primary tags`);

        // Delete branch tags (they reference master tags)
        // @ts-ignore
        const deletedBranch = await prisma.branchTag.deleteMany({});
        console.log(`Deleted ${deletedBranch.count} branch tags`);

        // Finally, delete master tags
        // @ts-ignore
        const deletedMaster = await prisma.masterTag.deleteMany({});
        console.log(`Deleted ${deletedMaster.count} master tags`);

        return NextResponse.json({
            success: true,
            message: "All tags have been successfully deleted",
            deleted: {
                tagImpressions: deletedImpressions.count,
                secondaryTags: deletedSecondary.count,
                primaryTags: deletedPrimary.count,
                branchTags: deletedBranch.count,
                masterTags: deletedMaster.count,
            },
            beforeDeletion: {
                tagImpressions: tagImpressionCount,
                masterTags: masterTagCount,
                primaryTags: primaryTagCount,
                secondaryTags: secondaryTagCount,
                branchTags: branchTagCount,
            }
        });
    } catch (error: any) {
        console.error("Delete all tags error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to delete all tags" },
            { status: 500 }
        );
    }
}

