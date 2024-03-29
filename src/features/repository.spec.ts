/**
 * @jest-environment node
 */
import { getRepositoryNameWithSubgroups, stripMultirepositoriesPatterns } from '@etabli/src/features/repository';

describe('stripMultirepositoriesPatterns()', () => {
  it('should confirm it can be indexed', async () => {
    expect(stripMultirepositoriesPatterns('project-name-api')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name-api-suffix')).toBe('project-name-suffix');
    expect(stripMultirepositoriesPatterns('-project-name-')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name-v6')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name-v185-app')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project.name.api')).toBe('project.name');
    expect(stripMultirepositoriesPatterns('project-name-api-backoffice')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name-api-hello')).toBe('project-name-hello');
    expect(stripMultirepositoriesPatterns('api-project-name')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('api-project-name')).toBe('project-name');
    expect(stripMultirepositoriesPatterns('project-name/api')).toBe('project-name/');
    expect(stripMultirepositoriesPatterns('subproject/backend-project-name/api')).toBe('subproject/project-name/');
  });
});

describe('getRepositoryNameWithSubgroups()', () => {
  it('should return the right part', async () => {
    expect(getRepositoryNameWithSubgroups('https://github.com/organization-a/project-b')).toBe('project-b');
    expect(getRepositoryNameWithSubgroups('https://gitlab.com/organization-b/mysubgroup/hello-backend')).toBe('mysubgroup/hello-backend');
  });
});
