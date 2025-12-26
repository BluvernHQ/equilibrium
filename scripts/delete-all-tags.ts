// Use the same Prisma client setup as the main app
import { prisma } from '../src/lib/prisma';

async function deleteAllTags() {
  try {
    console.log('Starting to delete all tags...');

    // Delete in order to respect foreign key constraints
    // Note: Due to cascade deletes, deleting MasterTag will automatically delete
    // PrimaryTag, BranchTag, SecondaryTag, and TagImpression
    
    // First, let's get counts for reporting
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

    console.log('\n✅ All tags have been successfully deleted from the database!');
  } catch (error) {
    console.error('❌ Error deleting tags:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
deleteAllTags()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

