import { JsonRepositoryPlatformSchema, JsonRepositoryPlatformSchemaType } from '@etabli/src/features/repository';
import { RawRepositoryPlatformSchema, RawRepositoryPlatformSchemaType } from '@etabli/src/models/entities/raw-repository';

export function rawRepositoryPlatformJsonToModel(csvType: JsonRepositoryPlatformSchemaType): RawRepositoryPlatformSchemaType | null {
  switch (csvType) {
    case JsonRepositoryPlatformSchema.enum.GitHub:
      return RawRepositoryPlatformSchema.enum.GITHUB;
    case JsonRepositoryPlatformSchema.enum.GitLab:
      return RawRepositoryPlatformSchema.enum.GITLAB;
    default:
      throw new Error('should be a defined platform');
  }
}
