import { CustomError as LibraryCustomError } from 'ts-custom-error';

export class CustomError extends LibraryCustomError {
  public constructor(
    public readonly code: string,
    message: string = ''
  ) {
    super(message);
  }

  public json(): object {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

export class UnexpectedError extends CustomError {}

export class BusinessError extends CustomError {
  public constructor(
    code: string,
    message: string = '',
    public readonly httpCode?: number
  ) {
    super(code, message);
  }

  public cloneWithHttpCode(httpCode: number): BusinessError {
    return new BusinessError(this.code, this.message, httpCode);
  }
}

export class BusinessDomainError extends BusinessError {
  public constructor(
    businessError: BusinessError,
    public readonly domain: string
  ) {
    super(businessError.code, businessError.message);
  }

  public cloneWithHttpCode(httpCode: number): BusinessDomainError {
    return new BusinessDomainError(new BusinessError(this.code, this.message), this.domain);
  }
}

//
// Errors definition
//

// General
export const internalServerErrorError = new UnexpectedError('internalServerError', 'internal server error');
export const unexpectedErrorError = new UnexpectedError('unexpectedError', 'unexpected error');

// Validations
export const unexpectedDomainRedirectionError = new BusinessError('unexpectedDomainRedirection', 'unexpected domain redirection');

// LLM
export const tokensReachTheLimitError = new BusinessError('tokensReachTheLimit', 'too many tokens according to the model limit');
