import { JsonRepositoryPlatformSchema, JsonRepositoryPlatformSchemaType } from '@etabli/features/repository';
import { RawRepositoryPlatformSchema, RawRepositoryPlatformSchemaType } from '@etabli/models/entities/raw-repository';

export function rawRepositoryPlatformJsonToModel(csvType: JsonRepositoryPlatformSchemaType): RawRepositoryPlatformSchemaType | null {
  switch (csvType) {
    case JsonRepositoryPlatformSchema.Values.GitHub:
      return RawRepositoryPlatformSchema.Values.GITHUB;
    case JsonRepositoryPlatformSchema.Values.GitLab:
      return RawRepositoryPlatformSchema.Values.GITLAB;
    default:
      throw new Error('should be a defined platform');
  }
}
