import type { Params } from './index';

import type * as Schema from '../../schema';
import type * as Data from '../../data';

import type {
  Array,
  Constants,
  Guard,
  String,
  Cast,
  If,
  MatchFirst,
  StrictEqual,
  Or,
  Extends,
  IsNever,
} from '../../utils';
import type * as UID from '../../uid';

type Pagination = { page: number; pageSize: number; pageCount: number; total: number };

type AnyEntity = { id: Params.Attribute.ID } & { [key: string]: any };

export type Result<
  TSchemaUID extends UID.Schema,
  TParams extends Params.Pick<TSchemaUID, 'fields' | 'populate'> = never,
> = If<
  Constants.AreSchemaRegistriesExtended,
  GetValues<
    TSchemaUID,
    Guard.Never<
      ExtractFields<TSchemaUID, TParams['fields']>,
      Schema.NonPopulatableAttributeNames<TSchemaUID>
    >,
    ExtractPopulate<TSchemaUID, TParams['populate']>
  >,
  AnyEntity
>;

export type Entity<
  TSchemaUID extends UID.Schema,
  TParams extends Params.Pick<TSchemaUID, 'fields' | 'populate'> = never,
> = If<
  Constants.AreSchemaRegistriesExtended,
  GetValues<
    TSchemaUID,
    Guard.Never<
      ExtractFields<TSchemaUID, TParams['fields']>,
      Schema.NonPopulatableAttributeNames<TSchemaUID>
    >,
    Guard.Never<
      ExtractPopulate<TSchemaUID, TParams['populate']>,
      Schema.PopulatableAttributeNames<TSchemaUID>
    >
  >,
  AnyEntity
>;

export type PartialEntity<
  TSchemaUID extends UID.Schema,
  TParams extends Params.Pick<TSchemaUID, 'fields' | 'populate'> = never,
> = Partial<Entity<TSchemaUID, TParams>>;

export type PaginatedResult<
  TSchemaUID extends UID.Schema,
  TParams extends Params.Pick<TSchemaUID, 'fields' | 'populate'> = never,
> = {
  results: Entity<TSchemaUID, TParams>[];
  pagination: Pagination;
};

/**
 * Attribute.GetValues override with extended values
 *
 * TODO: Make it recursive for populatable fields
 */
export type GetValues<
  TSchemaUID extends UID.Schema,
  TFields extends
    Schema.AttributeNames<TSchemaUID> = Schema.NonPopulatableAttributeNames<TSchemaUID>,
  TPopulate extends
    Schema.AttributeNames<TSchemaUID> = Schema.PopulatableAttributeNames<TSchemaUID>,
> = If<
  Constants.AreSchemaRegistriesExtended,
  Guard.Never<TFields | TPopulate, Schema.AttributeNames<TSchemaUID>> extends infer TKeys extends
    Schema.AttributeNames<TSchemaUID>
    ? Data.Entity<TSchemaUID, TKeys>
    : never,
  AnyEntity
>;

type ExtractFields<
  TSchemaUID extends UID.Schema,
  TFields extends Params.Fields.Any<TSchemaUID> | undefined,
> = Extract<
  MatchFirst<
    // No fields provided
    [
      [
        Or<
          StrictEqual<TFields, Params.Fields.Any<TSchemaUID>>,
          Or<IsNever<TFields>, StrictEqual<TFields, undefined>>
        >,
        never,
      ],
      // string
      [
        Extends<TFields, Params.Fields.StringNotation<TSchemaUID>>,
        ParseStringFields<TSchemaUID, Extract<TFields, Params.Fields.StringNotation<TSchemaUID>>>,
      ],
    ],
    // string array
    [
      Extends<TFields, Params.Fields.ArrayNotation<TSchemaUID>>,
      ParseStringFields<
        TSchemaUID,
        Extract<
          Array.Values<Cast<TFields, Params.Fields.ArrayNotation<TSchemaUID>>>,
          Params.Fields.StringNotation<TSchemaUID>
        >
      >,
    ]
  >,
  Schema.NonPopulatableAttributeNames<TSchemaUID>
>;

type ParseStringFields<
  TSchemaUID extends UID.Schema,
  TFields extends Params.Fields.StringNotation<TSchemaUID>,
> = TFields;

type ExtractPopulate<
  TSchemaUID extends UID.Schema,
  TPopulate extends Params.Populate.Any<TSchemaUID> | undefined,
> = Extract<
  MatchFirst<
    [
      // No populate provided
      [Or<StrictEqual<TPopulate, Params.Populate.Any<TSchemaUID>>, IsNever<TPopulate>>, never],
      // string notation
      [
        Extends<TPopulate, Params.Populate.StringNotation<TSchemaUID>>,
        ParseStringPopulate<
          TSchemaUID,
          Cast<TPopulate, Params.Populate.StringNotation<TSchemaUID>>
        >,
      ],
      // Array notation
      [
        Extends<TPopulate, Params.Populate.ArrayNotation<TSchemaUID>>,
        ParseStringPopulate<
          TSchemaUID,
          Cast<
            Array.Values<Cast<TPopulate, Params.Populate.ArrayNotation<TSchemaUID>>>,
            Params.Populate.StringNotation<TSchemaUID>
          >
        >,
      ],
      // object notation
      [
        Extends<TPopulate, Params.Populate.ObjectNotation<TSchemaUID>>,
        ParseStringPopulate<
          TSchemaUID,
          // TODO: Handle relations set to false in object notation
          Cast<keyof TPopulate, Params.Populate.StringNotation<TSchemaUID>>
        >,
      ],
    ]
  >,
  Schema.NonPopulatableAttributeNames<TSchemaUID>
>;

type ParsePopulateDotNotation<
  TSchemaUID extends UID.Schema,
  TPopulate extends Params.Populate.StringNotation<TSchemaUID>,
> = Cast<
  String.Split<Cast<TPopulate, string>, '.'>[0],
  Schema.PopulatableAttributeNames<TSchemaUID>
>;

type ParseStringPopulate<
  TSchemaUID extends UID.Schema,
  TPopulate extends Params.Populate.StringNotation<TSchemaUID>,
> = MatchFirst<
  [
    [
      StrictEqual<Params.Populate.WildcardNotation, TPopulate>,
      Schema.PopulatableAttributeNames<TSchemaUID>,
    ],
    [
      Extends<TPopulate, `${string},${string}`>,
      ParsePopulateDotNotation<
        TSchemaUID,
        Cast<
          Array.Values<String.Split<Cast<TPopulate, string>, ','>>,
          Params.Populate.StringNotation<TSchemaUID>
        >
      >,
    ],
    [Extends<TPopulate, `${string}.${string}`>, ParsePopulateDotNotation<TSchemaUID, TPopulate>],
  ],
  TPopulate
>;
