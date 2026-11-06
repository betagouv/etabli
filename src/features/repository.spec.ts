/**
 * @jest-environment node
 */
import { getRepositoryNameWithSubgroups, isLikelyStudentRepository, stripMultirepositoriesPatterns } from '@etabli/src/features/repository';

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

describe('isLikelyStudentRepository()', () => {
  const repository = {
    repositoryUrl: 'https://forge.univ-lyon1.fr/group/game',
    starsCount: 0,
    forksCount: 0,
    homepage: null,
    creationDate: new Date('2021-02-09'),
    lastModification: new Date('2021-07-16'),
  };

  it('should detect a short-lived repository without interest on a school forge', () => {
    expect(isLikelyStudentRepository(repository)).toBe(true);
  });

  it('should keep what shows some life or comes from elsewhere', () => {
    expect(isLikelyStudentRepository({ ...repository, starsCount: 1 })).toBe(false);
    expect(isLikelyStudentRepository({ ...repository, homepage: 'https://game.fr' })).toBe(false);
    expect(isLikelyStudentRepository({ ...repository, lastModification: new Date('2023-01-01') })).toBe(false);
    expect(isLikelyStudentRepository({ ...repository, repositoryUrl: 'https://github.com/betagouv/game' })).toBe(false);
  });
});
