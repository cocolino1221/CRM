# Pipeline WorkspaceId Fix

## Issue

When creating pipelines, the application was throwing a database constraint error:

```
QueryFailedError: null value in column "workspaceId" of relation "pipeline_stages" violates not-null constraint
```

## Root Cause

The issue was in `/backend/src/pipelines/pipeline.service.ts` where pipeline stages were being created using TypeORM's `repository.create()` method. While the `workspaceId` was being passed to the `create()` method, TypeORM wasn't reliably including it in the INSERT query.

## Files Modified

### `/backend/src/pipelines/pipeline.service.ts`

**Three methods were updated:**

#### 1. `createDefaultStages()` method (lines 240-260)

**Before:**
```typescript
const stages = defaultStages.map((stage) =>
  this.pipelineStageRepository.create({
    ...stage,
    workspaceId,
    pipelineId,
  }),
);

await this.pipelineStageRepository.save(stages);
```

**After:**
```typescript
const stages = defaultStages.map((stage) => ({
  ...stage,
  workspaceId,
  pipelineId,
  isClosedWon: stage.isClosedWon ?? false,
  isClosedLost: stage.isClosedLost ?? false,
}));

await this.pipelineStageRepository.save(stages);
```

#### 2. Custom stages creation in `createPipeline()` (lines 47-61)

**Before:**
```typescript
const stages = dto.stages.map((stageDto, index) =>
  this.pipelineStageRepository.create({
    ...stageDto,
    workspaceId,
    pipelineId: savedPipeline.id,
    displayOrder: stageDto.displayOrder ?? index,
  }),
);
await this.pipelineStageRepository.save(stages);
```

**After:**
```typescript
const stages = dto.stages.map((stageDto, index) => ({
  ...stageDto,
  workspaceId,
  pipelineId: savedPipeline.id,
  displayOrder: stageDto.displayOrder ?? index,
  isClosedWon: stageDto.isClosedWon ?? false,
  isClosedLost: stageDto.isClosedLost ?? false,
}));
await this.pipelineStageRepository.save(stages);
```

#### 3. `createStage()` method (lines 133-144)

**Before:**
```typescript
const stage = this.pipelineStageRepository.create({
  ...dto,
  workspaceId,
  pipelineId: pipeline.id,
  displayOrder: dto.displayOrder ?? (await this.getNextStageOrder(pipelineId)),
});

return this.pipelineStageRepository.save(stage);
```

**After:**
```typescript
const stage = {
  ...dto,
  workspaceId,
  pipelineId: pipeline.id,
  displayOrder: dto.displayOrder ?? (await this.getNextStageOrder(pipelineId)),
  isClosedWon: dto.isClosedWon ?? false,
  isClosedLost: dto.isClosedLost ?? false,
};

return this.pipelineStageRepository.save(stage);
```

## Solution

Changed from using `repository.create()` to plain JavaScript objects. The `repository.save()` method accepts both entity instances and plain objects. When given plain objects, TypeORM will reliably create and insert them with all provided fields, including `workspaceId`.

### Key Changes:

1. **Plain Objects**: Use plain objects `({ ... })` instead of `repository.create({ ... })`
2. **Explicit Defaults**: Added explicit default values for `isClosedWon` and `isClosedLost` to ensure consistency
3. **Direct Save**: Pass plain objects directly to `repository.save()` which handles entity creation internally

## Testing

After the fix:

1. Backend starts successfully with 0 TypeScript errors
2. All routes are properly mapped
3. Health endpoint responds correctly on `http://localhost:4000/api/v1/health`

## Impact

This fix ensures that:

- All pipeline stages are created with proper `workspaceId` values
- Database constraints are satisfied
- Multi-tenancy isolation is maintained
- No orphaned pipeline stages without workspace association

## Related Entities

- **PipelineStage**: `/backend/src/database/entities/pipeline-stage.entity.ts`
  - Extends `WorkspaceEntity` which includes `workspaceId` field
  - Column defined as `uuid NOT NULL` in database

- **Migration**: `/backend/src/database/migrations/1761285310161-AddPipelineAndRoles.ts`
  - Creates `pipeline_stages` table with `workspaceId uuid NOT NULL` constraint

## Prevention

To prevent similar issues in the future:

1. **Prefer plain objects** when creating entities with required fields
2. **Use `repository.insert()`** for bulk insertions when you don't need entity instances
3. **Always validate** that `workspaceId` is present before any database operations
4. **Add unit tests** to verify workspace isolation for all entity types

## Date

Fixed: January 15, 2026
