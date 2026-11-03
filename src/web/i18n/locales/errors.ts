/** Every code the API answers an error with that the screen explains in its own words */
export const API_ERROR_CODES = [
  'ERR_NETWORK',
  'ERR_INTERNAL',
  'ERR_FORBIDDEN',
  'ERR_NOT_FOUND',
  'ERR_BAD_REQUEST',
  'VALIDATION_ERROR',
  'PAYLOAD_TOO_LARGE',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'TOO_MANY_LOGINS',
  'JOB_NOT_FOUND',
  'JOB_NOT_ANALYZED',
  'ANALYSIS_NOT_FAILED',
  'CANDIDATE_NOT_FOUND',
  'PROFILE_NOT_RETRYABLE',
  'FILE_SIZE',
  'FILE_TYPE',
  'STORE_FAILED',
] as const

/** One of API_ERROR_CODES */
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/** What the person reads for each error code; the server's own English text never reaches them */
export const errors: Record<
  'en-US' | 'pt-BR',
  Record<ApiErrorCode | 'UNKNOWN', string>
> = {
  'en-US': {
    UNKNOWN: 'Something went wrong. Try again.',
    ERR_NETWORK: 'The server did not answer. Try again.',
    ERR_INTERNAL: 'The server hit an error. Try again.',
    ERR_FORBIDDEN: 'This request was refused.',
    ERR_NOT_FOUND: 'This does not exist.',
    ERR_BAD_REQUEST: 'The request was not valid.',
    VALIDATION_ERROR: 'Check the highlighted fields.',
    PAYLOAD_TOO_LARGE: 'This is too large to send.',
    UNAUTHENTICATED: 'Sign in to continue.',
    INVALID_CREDENTIALS: 'Wrong username or password.',
    TOO_MANY_LOGINS:
      'Too many failed attempts from this network. Try again in a few minutes.',
    JOB_NOT_FOUND: 'This job was deleted.',
    JOB_NOT_ANALYZED:
      'The description is still being read. Rank once it is ready.',
    ANALYSIS_NOT_FAILED: 'This description is already being read again.',
    CANDIDATE_NOT_FOUND: 'This candidate was already deleted.',
    PROFILE_NOT_RETRYABLE:
      'This resume is already being read, or its profile is up to date.',
    FILE_SIZE: 'Empty or larger than 2 MB',
    FILE_TYPE: 'Not a PDF or DOCX',
    STORE_FAILED: 'Could not be stored',
  },
  'pt-BR': {
    UNKNOWN: 'Algo deu errado. Tente de novo.',
    ERR_NETWORK: 'O servidor não respondeu. Tente de novo.',
    ERR_INTERNAL: 'O servidor encontrou um erro. Tente de novo.',
    ERR_FORBIDDEN: 'Este pedido foi recusado.',
    ERR_NOT_FOUND: 'Isto não existe.',
    ERR_BAD_REQUEST: 'O pedido não é válido.',
    VALIDATION_ERROR: 'Confira os campos marcados.',
    PAYLOAD_TOO_LARGE: 'Isto é grande demais para enviar.',
    UNAUTHENTICATED: 'Entre para continuar.',
    INVALID_CREDENTIALS: 'Usuário ou senha incorretos.',
    TOO_MANY_LOGINS:
      'Muitas tentativas sem sucesso nesta rede. Tente de novo em alguns minutos.',
    JOB_NOT_FOUND: 'Esta vaga foi excluída.',
    JOB_NOT_ANALYZED:
      'A descrição ainda está sendo lida. Ranqueie quando estiver pronta.',
    ANALYSIS_NOT_FAILED: 'Esta descrição já está sendo lida de novo.',
    CANDIDATE_NOT_FOUND: 'Este candidato já foi excluído.',
    PROFILE_NOT_RETRYABLE:
      'Este currículo já está sendo lido, ou o perfil já está em dia.',
    FILE_SIZE: 'Vazio ou maior que 2 MB',
    FILE_TYPE: 'Não é PDF nem DOCX',
    STORE_FAILED: 'Não foi possível guardar',
  },
}
