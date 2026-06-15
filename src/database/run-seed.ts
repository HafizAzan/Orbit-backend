import { createSeedDataSource } from './data-source';
import { seedSuperAdmin } from './seeds/super-admin.seed';

async function runSeed() {
  const dataSource = createSeedDataSource();

  try {
    await dataSource.initialize();
    const result = await seedSuperAdmin(dataSource);
    console.log(`Super admin ${result.action}: ${result.email}`);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

void runSeed();
