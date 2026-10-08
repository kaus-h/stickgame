// Generated from content/level.schema.json by npm run levels:compile-schema. Do not edit.
'use strict';
export const validate = validate21;
export default validate21;
const schema6 = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://stickgame.dev/schemas/level.json',
  title: 'StickGame level authoring v1/v2',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'id', 'name', 'spawn', 'bounds', 'killY', 'solids'],
  properties: {
    $schema: { type: 'string' },
    version: { enum: [1, 2] },
    id: { $ref: '#/definitions/id' },
    name: { $ref: '#/definitions/text' },
    spawn: { $ref: '#/definitions/point' },
    bounds: {
      type: 'object',
      additionalProperties: false,
      required: ['minX', 'minY', 'maxX', 'maxY'],
      properties: {
        minX: { type: 'number' },
        minY: { type: 'number' },
        maxX: { type: 'number' },
        maxY: { type: 'number' },
      },
    },
    killY: { type: 'number' },
    solids: { type: 'array', items: { $ref: '#/definitions/solid' } },
    anchors: { type: 'array', items: { $ref: '#/definitions/anchor' } },
    exit: { $ref: '#/definitions/region' },
    section: { $ref: '#/definitions/id' },
    telemetry: {
      type: 'object',
      additionalProperties: false,
      required: ['levelId'],
      properties: { levelId: { $ref: '#/definitions/id' } },
    },
    chambers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'region', 'problem', 'challengeFamily'],
        properties: {
          id: { $ref: '#/definitions/id' },
          region: { $ref: '#/definitions/region' },
          problem: { $ref: '#/definitions/text' },
          challengeFamily: { $ref: '#/definitions/text' },
        },
      },
    },
    checkpoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'position'],
        properties: { id: { $ref: '#/definitions/id' }, position: { $ref: '#/definitions/point' } },
      },
    },
    tunnels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'region'],
        properties: { id: { $ref: '#/definitions/id' }, region: { $ref: '#/definitions/region' } },
      },
    },
    cameraHints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'region', 'focus'],
        properties: {
          id: { $ref: '#/definitions/id' },
          region: { $ref: '#/definitions/region' },
          focus: { $ref: '#/definitions/point' },
        },
      },
    },
  },
  definitions: {
    text: { type: 'string', minLength: 1 },
    id: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' },
    point: {
      oneOf: [
        { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
        {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y'],
          properties: { x: { type: 'number' }, y: { type: 'number' } },
        },
      ],
    },
    region: {
      type: 'object',
      additionalProperties: false,
      required: ['min', 'max'],
      properties: { min: { $ref: '#/definitions/point' }, max: { $ref: '#/definitions/point' } },
    },
    solid: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      oneOf: [{ required: ['rect'] }, { required: ['points'] }],
      properties: {
        id: { $ref: '#/definitions/id' },
        kind: { enum: ['solid', 'hazard'] },
        rect: {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y', 'w', 'h'],
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            w: { type: 'number', exclusiveMinimum: 0 },
            h: { type: 'number', exclusiveMinimum: 0 },
          },
        },
        points: { type: 'array', minItems: 3, items: { $ref: '#/definitions/point' } },
        visualPoints: { type: 'array', minItems: 3, items: { $ref: '#/definitions/point' } },
      },
    },
    anchor: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'position'],
      properties: {
        id: { $ref: '#/definitions/id' },
        position: { $ref: '#/definitions/point' },
        requiredFrom: { $ref: '#/definitions/point' },
        radius: { type: 'number', exclusiveMinimum: 0 },
        path: {
          type: 'object',
          additionalProperties: false,
          required: ['to', 'period'],
          properties: {
            to: { $ref: '#/definitions/point' },
            period: { type: 'number', exclusiveMinimum: 0 },
            phase: { type: 'number', minimum: 0, exclusiveMaximum: 1 },
          },
        },
      },
    },
  },
};
const func2 = Object.prototype.hasOwnProperty;
const schema7 = { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' };
const pattern0 = new RegExp('^[a-zA-Z0-9][a-zA-Z0-9._-]*$', 'u');
function validate22(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data === 'string') {
    if (!pattern0.test(data)) {
      const err0 = {
        instancePath,
        schemaPath: '#/pattern',
        keyword: 'pattern',
        params: { pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' },
        message: 'must match pattern "' + '^[a-zA-Z0-9][a-zA-Z0-9._-]*$' + '"',
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
  } else {
    const err1 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  validate22.errors = vErrors;
  return errors === 0;
}
const schema8 = { type: 'string', minLength: 1 };
function validate24(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (typeof data === 'string') {
    if (data.length < 1) {
      const err0 = {
        instancePath,
        schemaPath: '#/minLength',
        keyword: 'minLength',
        params: { limit: 1 },
        message: 'must NOT have fewer than 1 characters',
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
  } else {
    const err1 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'string' },
      message: 'must be string',
    };
    if (vErrors === null) {
      vErrors = [err1];
    } else {
      vErrors.push(err1);
    }
    errors++;
  }
  validate24.errors = vErrors;
  return errors === 0;
}
const schema9 = {
  oneOf: [
    { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
    {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y'],
      properties: { x: { type: 'number' }, y: { type: 'number' } },
    },
  ],
};
function validate26(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs0 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs1 = errors;
  if (Array.isArray(data)) {
    if (data.length > 2) {
      const err0 = {
        instancePath,
        schemaPath: '#/oneOf/0/maxItems',
        keyword: 'maxItems',
        params: { limit: 2 },
        message: 'must NOT have more than 2 items',
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.length < 2) {
      const err1 = {
        instancePath,
        schemaPath: '#/oneOf/0/minItems',
        keyword: 'minItems',
        params: { limit: 2 },
        message: 'must NOT have fewer than 2 items',
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    const len0 = data.length;
    for (let i0 = 0; i0 < len0; i0++) {
      let data0 = data[i0];
      if (!(typeof data0 == 'number' && isFinite(data0))) {
        const err2 = {
          instancePath: instancePath + '/' + i0,
          schemaPath: '#/oneOf/0/items/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
  } else {
    const err3 = {
      instancePath,
      schemaPath: '#/oneOf/0/type',
      keyword: 'type',
      params: { type: 'array' },
      message: 'must be array',
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  var _valid0 = _errs1 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs5 = errors;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.x === undefined) {
      const err4 = {
        instancePath,
        schemaPath: '#/oneOf/1/required',
        keyword: 'required',
        params: { missingProperty: 'x' },
        message: "must have required property '" + 'x' + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.y === undefined) {
      const err5 = {
        instancePath,
        schemaPath: '#/oneOf/1/required',
        keyword: 'required',
        params: { missingProperty: 'y' },
        message: "must have required property '" + 'y' + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === 'x' || key0 === 'y')) {
        const err6 = {
          instancePath,
          schemaPath: '#/oneOf/1/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      }
    }
    if (data.x !== undefined) {
      let data1 = data.x;
      if (!(typeof data1 == 'number' && isFinite(data1))) {
        const err7 = {
          instancePath: instancePath + '/x',
          schemaPath: '#/oneOf/1/properties/x/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.y !== undefined) {
      let data2 = data.y;
      if (!(typeof data2 == 'number' && isFinite(data2))) {
        const err8 = {
          instancePath: instancePath + '/y',
          schemaPath: '#/oneOf/1/properties/y/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
  } else {
    const err9 = {
      instancePath,
      schemaPath: '#/oneOf/1/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err9];
    } else {
      vErrors.push(err9);
    }
    errors++;
  }
  var _valid0 = _errs5 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
  }
  if (!valid0) {
    const err10 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err10];
    } else {
      vErrors.push(err10);
    }
    errors++;
  } else {
    errors = _errs0;
    if (vErrors !== null) {
      if (_errs0) {
        vErrors.length = _errs0;
      } else {
        vErrors = null;
      }
    }
  }
  validate26.errors = vErrors;
  return errors === 0;
}
const schema10 = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  oneOf: [{ required: ['rect'] }, { required: ['points'] }],
  properties: {
    id: { $ref: '#/definitions/id' },
    kind: { enum: ['solid', 'hazard'] },
    rect: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y', 'w', 'h'],
      properties: {
        x: { type: 'number' },
        y: { type: 'number' },
        w: { type: 'number', exclusiveMinimum: 0 },
        h: { type: 'number', exclusiveMinimum: 0 },
      },
    },
    points: { type: 'array', minItems: 3, items: { $ref: '#/definitions/point' } },
    visualPoints: { type: 'array', minItems: 3, items: { $ref: '#/definitions/point' } },
  },
};
function validate28(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  const _errs1 = errors;
  let valid0 = false;
  let passing0 = null;
  const _errs2 = errors;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.rect === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/oneOf/0/required',
        keyword: 'required',
        params: { missingProperty: 'rect' },
        message: "must have required property '" + 'rect' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
  }
  var _valid0 = _errs2 === errors;
  if (_valid0) {
    valid0 = true;
    passing0 = 0;
  }
  const _errs3 = errors;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.points === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/oneOf/1/required',
        keyword: 'required',
        params: { missingProperty: 'points' },
        message: "must have required property '" + 'points' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
  }
  var _valid0 = _errs3 === errors;
  if (_valid0 && valid0) {
    valid0 = false;
    passing0 = [passing0, 1];
  } else {
    if (_valid0) {
      valid0 = true;
      passing0 = 1;
    }
  }
  if (!valid0) {
    const err2 = {
      instancePath,
      schemaPath: '#/oneOf',
      keyword: 'oneOf',
      params: { passingSchemas: passing0 },
      message: 'must match exactly one schema in oneOf',
    };
    if (vErrors === null) {
      vErrors = [err2];
    } else {
      vErrors.push(err2);
    }
    errors++;
  } else {
    errors = _errs1;
    if (vErrors !== null) {
      if (_errs1) {
        vErrors.length = _errs1;
      } else {
        vErrors = null;
      }
    }
  }
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err3 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'id' },
        message: "must have required property '" + 'id' + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === 'id' ||
        key0 === 'kind' ||
        key0 === 'rect' ||
        key0 === 'points' ||
        key0 === 'visualPoints'
      )) {
        const err4 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      if (
        !validate22(data.id, {
          instancePath: instancePath + '/id',
          parentData: data,
          parentDataProperty: 'id',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
        errors = vErrors.length;
      }
    }
    if (data.kind !== undefined) {
      let data1 = data.kind;
      if (!(data1 === 'solid' || data1 === 'hazard')) {
        const err5 = {
          instancePath: instancePath + '/kind',
          schemaPath: '#/properties/kind/enum',
          keyword: 'enum',
          params: { allowedValues: schema10.properties.kind.enum },
          message: 'must be equal to one of the allowed values',
        };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
    }
    if (data.rect !== undefined) {
      let data2 = data.rect;
      if (data2 && typeof data2 == 'object' && !Array.isArray(data2)) {
        if (data2.x === undefined) {
          const err6 = {
            instancePath: instancePath + '/rect',
            schemaPath: '#/properties/rect/required',
            keyword: 'required',
            params: { missingProperty: 'x' },
            message: "must have required property '" + 'x' + "'",
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data2.y === undefined) {
          const err7 = {
            instancePath: instancePath + '/rect',
            schemaPath: '#/properties/rect/required',
            keyword: 'required',
            params: { missingProperty: 'y' },
            message: "must have required property '" + 'y' + "'",
          };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data2.w === undefined) {
          const err8 = {
            instancePath: instancePath + '/rect',
            schemaPath: '#/properties/rect/required',
            keyword: 'required',
            params: { missingProperty: 'w' },
            message: "must have required property '" + 'w' + "'",
          };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data2.h === undefined) {
          const err9 = {
            instancePath: instancePath + '/rect',
            schemaPath: '#/properties/rect/required',
            keyword: 'required',
            params: { missingProperty: 'h' },
            message: "must have required property '" + 'h' + "'",
          };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key1 in data2) {
          if (!(key1 === 'x' || key1 === 'y' || key1 === 'w' || key1 === 'h')) {
            const err10 = {
              instancePath: instancePath + '/rect',
              schemaPath: '#/properties/rect/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key1 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data2.x !== undefined) {
          let data3 = data2.x;
          if (!(typeof data3 == 'number' && isFinite(data3))) {
            const err11 = {
              instancePath: instancePath + '/rect/x',
              schemaPath: '#/properties/rect/properties/x/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data2.y !== undefined) {
          let data4 = data2.y;
          if (!(typeof data4 == 'number' && isFinite(data4))) {
            const err12 = {
              instancePath: instancePath + '/rect/y',
              schemaPath: '#/properties/rect/properties/y/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data2.w !== undefined) {
          let data5 = data2.w;
          if (typeof data5 == 'number' && isFinite(data5)) {
            if (data5 <= 0 || isNaN(data5)) {
              const err13 = {
                instancePath: instancePath + '/rect/w',
                schemaPath: '#/properties/rect/properties/w/exclusiveMinimum',
                keyword: 'exclusiveMinimum',
                params: { comparison: '>', limit: 0 },
                message: 'must be > 0',
              };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = {
              instancePath: instancePath + '/rect/w',
              schemaPath: '#/properties/rect/properties/w/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data2.h !== undefined) {
          let data6 = data2.h;
          if (typeof data6 == 'number' && isFinite(data6)) {
            if (data6 <= 0 || isNaN(data6)) {
              const err15 = {
                instancePath: instancePath + '/rect/h',
                schemaPath: '#/properties/rect/properties/h/exclusiveMinimum',
                keyword: 'exclusiveMinimum',
                params: { comparison: '>', limit: 0 },
                message: 'must be > 0',
              };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          } else {
            const err16 = {
              instancePath: instancePath + '/rect/h',
              schemaPath: '#/properties/rect/properties/h/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
      } else {
        const err17 = {
          instancePath: instancePath + '/rect',
          schemaPath: '#/properties/rect/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      }
    }
    if (data.points !== undefined) {
      let data7 = data.points;
      if (Array.isArray(data7)) {
        if (data7.length < 3) {
          const err18 = {
            instancePath: instancePath + '/points',
            schemaPath: '#/properties/points/minItems',
            keyword: 'minItems',
            params: { limit: 3 },
            message: 'must NOT have fewer than 3 items',
          };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        const len0 = data7.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate26(data7[i0], {
              instancePath: instancePath + '/points/' + i0,
              parentData: data7,
              parentDataProperty: i0,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err19 = {
          instancePath: instancePath + '/points',
          schemaPath: '#/properties/points/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.visualPoints !== undefined) {
      let data9 = data.visualPoints;
      if (Array.isArray(data9)) {
        if (data9.length < 3) {
          const err20 = {
            instancePath: instancePath + '/visualPoints',
            schemaPath: '#/properties/visualPoints/minItems',
            keyword: 'minItems',
            params: { limit: 3 },
            message: 'must NOT have fewer than 3 items',
          };
          if (vErrors === null) {
            vErrors = [err20];
          } else {
            vErrors.push(err20);
          }
          errors++;
        }
        const len1 = data9.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (
            !validate26(data9[i1], {
              instancePath: instancePath + '/visualPoints/' + i1,
              parentData: data9,
              parentDataProperty: i1,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err21 = {
          instancePath: instancePath + '/visualPoints',
          schemaPath: '#/properties/visualPoints/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
  } else {
    const err22 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err22];
    } else {
      vErrors.push(err22);
    }
    errors++;
  }
  validate28.errors = vErrors;
  return errors === 0;
}
const schema11 = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'position'],
  properties: {
    id: { $ref: '#/definitions/id' },
    position: { $ref: '#/definitions/point' },
    requiredFrom: { $ref: '#/definitions/point' },
    radius: { type: 'number', exclusiveMinimum: 0 },
    path: {
      type: 'object',
      additionalProperties: false,
      required: ['to', 'period'],
      properties: {
        to: { $ref: '#/definitions/point' },
        period: { type: 'number', exclusiveMinimum: 0 },
        phase: { type: 'number', minimum: 0, exclusiveMaximum: 1 },
      },
    },
  },
};
function validate33(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.id === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'id' },
        message: "must have required property '" + 'id' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.position === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'position' },
        message: "must have required property '" + 'position' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(
        key0 === 'id' ||
        key0 === 'position' ||
        key0 === 'requiredFrom' ||
        key0 === 'radius' ||
        key0 === 'path'
      )) {
        const err2 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      if (
        !validate22(data.id, {
          instancePath: instancePath + '/id',
          parentData: data,
          parentDataProperty: 'id',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
        errors = vErrors.length;
      }
    }
    if (data.position !== undefined) {
      if (
        !validate26(data.position, {
          instancePath: instancePath + '/position',
          parentData: data,
          parentDataProperty: 'position',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
        errors = vErrors.length;
      }
    }
    if (data.requiredFrom !== undefined) {
      if (
        !validate26(data.requiredFrom, {
          instancePath: instancePath + '/requiredFrom',
          parentData: data,
          parentDataProperty: 'requiredFrom',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
        errors = vErrors.length;
      }
    }
    if (data.radius !== undefined) {
      let data3 = data.radius;
      if (typeof data3 == 'number' && isFinite(data3)) {
        if (data3 <= 0 || isNaN(data3)) {
          const err3 = {
            instancePath: instancePath + '/radius',
            schemaPath: '#/properties/radius/exclusiveMinimum',
            keyword: 'exclusiveMinimum',
            params: { comparison: '>', limit: 0 },
            message: 'must be > 0',
          };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
      } else {
        const err4 = {
          instancePath: instancePath + '/radius',
          schemaPath: '#/properties/radius/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err4];
        } else {
          vErrors.push(err4);
        }
        errors++;
      }
    }
    if (data.path !== undefined) {
      let data4 = data.path;
      if (data4 && typeof data4 == 'object' && !Array.isArray(data4)) {
        if (data4.to === undefined) {
          const err5 = {
            instancePath: instancePath + '/path',
            schemaPath: '#/properties/path/required',
            keyword: 'required',
            params: { missingProperty: 'to' },
            message: "must have required property '" + 'to' + "'",
          };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data4.period === undefined) {
          const err6 = {
            instancePath: instancePath + '/path',
            schemaPath: '#/properties/path/required',
            keyword: 'required',
            params: { missingProperty: 'period' },
            message: "must have required property '" + 'period' + "'",
          };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key1 in data4) {
          if (!(key1 === 'to' || key1 === 'period' || key1 === 'phase')) {
            const err7 = {
              instancePath: instancePath + '/path',
              schemaPath: '#/properties/path/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key1 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data4.to !== undefined) {
          if (
            !validate26(data4.to, {
              instancePath: instancePath + '/path/to',
              parentData: data4,
              parentDataProperty: 'to',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
            errors = vErrors.length;
          }
        }
        if (data4.period !== undefined) {
          let data6 = data4.period;
          if (typeof data6 == 'number' && isFinite(data6)) {
            if (data6 <= 0 || isNaN(data6)) {
              const err8 = {
                instancePath: instancePath + '/path/period',
                schemaPath: '#/properties/path/properties/period/exclusiveMinimum',
                keyword: 'exclusiveMinimum',
                params: { comparison: '>', limit: 0 },
                message: 'must be > 0',
              };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = {
              instancePath: instancePath + '/path/period',
              schemaPath: '#/properties/path/properties/period/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data4.phase !== undefined) {
          let data7 = data4.phase;
          if (typeof data7 == 'number' && isFinite(data7)) {
            if (data7 < 0 || isNaN(data7)) {
              const err10 = {
                instancePath: instancePath + '/path/phase',
                schemaPath: '#/properties/path/properties/phase/minimum',
                keyword: 'minimum',
                params: { comparison: '>=', limit: 0 },
                message: 'must be >= 0',
              };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if (data7 >= 1 || isNaN(data7)) {
              const err11 = {
                instancePath: instancePath + '/path/phase',
                schemaPath: '#/properties/path/properties/phase/exclusiveMaximum',
                keyword: 'exclusiveMaximum',
                params: { comparison: '<', limit: 1 },
                message: 'must be < 1',
              };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = {
              instancePath: instancePath + '/path/phase',
              schemaPath: '#/properties/path/properties/phase/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
      } else {
        const err13 = {
          instancePath: instancePath + '/path',
          schemaPath: '#/properties/path/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
  } else {
    const err14 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err14];
    } else {
      vErrors.push(err14);
    }
    errors++;
  }
  validate33.errors = vErrors;
  return errors === 0;
}
const schema12 = {
  type: 'object',
  additionalProperties: false,
  required: ['min', 'max'],
  properties: { min: { $ref: '#/definitions/point' }, max: { $ref: '#/definitions/point' } },
};
function validate39(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.min === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'min' },
        message: "must have required property '" + 'min' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.max === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'max' },
        message: "must have required property '" + 'max' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!(key0 === 'min' || key0 === 'max')) {
        const err2 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err2];
        } else {
          vErrors.push(err2);
        }
        errors++;
      }
    }
    if (data.min !== undefined) {
      if (
        !validate26(data.min, {
          instancePath: instancePath + '/min',
          parentData: data,
          parentDataProperty: 'min',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
        errors = vErrors.length;
      }
    }
    if (data.max !== undefined) {
      if (
        !validate26(data.max, {
          instancePath: instancePath + '/max',
          parentData: data,
          parentDataProperty: 'max',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
        errors = vErrors.length;
      }
    }
  } else {
    const err3 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err3];
    } else {
      vErrors.push(err3);
    }
    errors++;
  }
  validate39.errors = vErrors;
  return errors === 0;
}
function validate21(
  data,
  { instancePath = '', parentData, parentDataProperty, rootData = data } = {},
) {
  /*# sourceURL="https://stickgame.dev/schemas/level.json" */ let vErrors = null;
  let errors = 0;
  if (data && typeof data == 'object' && !Array.isArray(data)) {
    if (data.version === undefined) {
      const err0 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'version' },
        message: "must have required property '" + 'version' + "'",
      };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.id === undefined) {
      const err1 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'id' },
        message: "must have required property '" + 'id' + "'",
      };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.name === undefined) {
      const err2 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'name' },
        message: "must have required property '" + 'name' + "'",
      };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.spawn === undefined) {
      const err3 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'spawn' },
        message: "must have required property '" + 'spawn' + "'",
      };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.bounds === undefined) {
      const err4 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'bounds' },
        message: "must have required property '" + 'bounds' + "'",
      };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.killY === undefined) {
      const err5 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'killY' },
        message: "must have required property '" + 'killY' + "'",
      };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.solids === undefined) {
      const err6 = {
        instancePath,
        schemaPath: '#/required',
        keyword: 'required',
        params: { missingProperty: 'solids' },
        message: "must have required property '" + 'solids' + "'",
      };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func2.call(schema6.properties, key0)) {
        const err7 = {
          instancePath,
          schemaPath: '#/additionalProperties',
          keyword: 'additionalProperties',
          params: { additionalProperty: key0 },
          message: 'must NOT have additional properties',
        };
        if (vErrors === null) {
          vErrors = [err7];
        } else {
          vErrors.push(err7);
        }
        errors++;
      }
    }
    if (data.$schema !== undefined) {
      if (typeof data.$schema !== 'string') {
        const err8 = {
          instancePath: instancePath + '/$schema',
          schemaPath: '#/properties/%24schema/type',
          keyword: 'type',
          params: { type: 'string' },
          message: 'must be string',
        };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.version !== undefined) {
      let data1 = data.version;
      if (!(data1 === 1 || data1 === 2)) {
        const err9 = {
          instancePath: instancePath + '/version',
          schemaPath: '#/properties/version/enum',
          keyword: 'enum',
          params: { allowedValues: schema6.properties.version.enum },
          message: 'must be equal to one of the allowed values',
        };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.id !== undefined) {
      if (
        !validate22(data.id, {
          instancePath: instancePath + '/id',
          parentData: data,
          parentDataProperty: 'id',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
        errors = vErrors.length;
      }
    }
    if (data.name !== undefined) {
      if (
        !validate24(data.name, {
          instancePath: instancePath + '/name',
          parentData: data,
          parentDataProperty: 'name',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
        errors = vErrors.length;
      }
    }
    if (data.spawn !== undefined) {
      if (
        !validate26(data.spawn, {
          instancePath: instancePath + '/spawn',
          parentData: data,
          parentDataProperty: 'spawn',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
        errors = vErrors.length;
      }
    }
    if (data.bounds !== undefined) {
      let data5 = data.bounds;
      if (data5 && typeof data5 == 'object' && !Array.isArray(data5)) {
        if (data5.minX === undefined) {
          const err10 = {
            instancePath: instancePath + '/bounds',
            schemaPath: '#/properties/bounds/required',
            keyword: 'required',
            params: { missingProperty: 'minX' },
            message: "must have required property '" + 'minX' + "'",
          };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data5.minY === undefined) {
          const err11 = {
            instancePath: instancePath + '/bounds',
            schemaPath: '#/properties/bounds/required',
            keyword: 'required',
            params: { missingProperty: 'minY' },
            message: "must have required property '" + 'minY' + "'",
          };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (data5.maxX === undefined) {
          const err12 = {
            instancePath: instancePath + '/bounds',
            schemaPath: '#/properties/bounds/required',
            keyword: 'required',
            params: { missingProperty: 'maxX' },
            message: "must have required property '" + 'maxX' + "'",
          };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        if (data5.maxY === undefined) {
          const err13 = {
            instancePath: instancePath + '/bounds',
            schemaPath: '#/properties/bounds/required',
            keyword: 'required',
            params: { missingProperty: 'maxY' },
            message: "must have required property '" + 'maxY' + "'",
          };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        for (const key1 in data5) {
          if (!(key1 === 'minX' || key1 === 'minY' || key1 === 'maxX' || key1 === 'maxY')) {
            const err14 = {
              instancePath: instancePath + '/bounds',
              schemaPath: '#/properties/bounds/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key1 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data5.minX !== undefined) {
          let data6 = data5.minX;
          if (!(typeof data6 == 'number' && isFinite(data6))) {
            const err15 = {
              instancePath: instancePath + '/bounds/minX',
              schemaPath: '#/properties/bounds/properties/minX/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data5.minY !== undefined) {
          let data7 = data5.minY;
          if (!(typeof data7 == 'number' && isFinite(data7))) {
            const err16 = {
              instancePath: instancePath + '/bounds/minY',
              schemaPath: '#/properties/bounds/properties/minY/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data5.maxX !== undefined) {
          let data8 = data5.maxX;
          if (!(typeof data8 == 'number' && isFinite(data8))) {
            const err17 = {
              instancePath: instancePath + '/bounds/maxX',
              schemaPath: '#/properties/bounds/properties/maxX/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data5.maxY !== undefined) {
          let data9 = data5.maxY;
          if (!(typeof data9 == 'number' && isFinite(data9))) {
            const err18 = {
              instancePath: instancePath + '/bounds/maxY',
              schemaPath: '#/properties/bounds/properties/maxY/type',
              keyword: 'type',
              params: { type: 'number' },
              message: 'must be number',
            };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
      } else {
        const err19 = {
          instancePath: instancePath + '/bounds',
          schemaPath: '#/properties/bounds/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
    }
    if (data.killY !== undefined) {
      let data10 = data.killY;
      if (!(typeof data10 == 'number' && isFinite(data10))) {
        const err20 = {
          instancePath: instancePath + '/killY',
          schemaPath: '#/properties/killY/type',
          keyword: 'type',
          params: { type: 'number' },
          message: 'must be number',
        };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.solids !== undefined) {
      let data11 = data.solids;
      if (Array.isArray(data11)) {
        const len0 = data11.length;
        for (let i0 = 0; i0 < len0; i0++) {
          if (
            !validate28(data11[i0], {
              instancePath: instancePath + '/solids/' + i0,
              parentData: data11,
              parentDataProperty: i0,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err21 = {
          instancePath: instancePath + '/solids',
          schemaPath: '#/properties/solids/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
        }
        errors++;
      }
    }
    if (data.anchors !== undefined) {
      let data13 = data.anchors;
      if (Array.isArray(data13)) {
        const len1 = data13.length;
        for (let i1 = 0; i1 < len1; i1++) {
          if (
            !validate33(data13[i1], {
              instancePath: instancePath + '/anchors/' + i1,
              parentData: data13,
              parentDataProperty: i1,
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err22 = {
          instancePath: instancePath + '/anchors',
          schemaPath: '#/properties/anchors/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
    }
    if (data.exit !== undefined) {
      if (
        !validate39(data.exit, {
          instancePath: instancePath + '/exit',
          parentData: data,
          parentDataProperty: 'exit',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
        errors = vErrors.length;
      }
    }
    if (data.section !== undefined) {
      if (
        !validate22(data.section, {
          instancePath: instancePath + '/section',
          parentData: data,
          parentDataProperty: 'section',
          rootData,
        })
      ) {
        vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
        errors = vErrors.length;
      }
    }
    if (data.telemetry !== undefined) {
      let data17 = data.telemetry;
      if (data17 && typeof data17 == 'object' && !Array.isArray(data17)) {
        if (data17.levelId === undefined) {
          const err23 = {
            instancePath: instancePath + '/telemetry',
            schemaPath: '#/properties/telemetry/required',
            keyword: 'required',
            params: { missingProperty: 'levelId' },
            message: "must have required property '" + 'levelId' + "'",
          };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
        for (const key2 in data17) {
          if (!(key2 === 'levelId')) {
            const err24 = {
              instancePath: instancePath + '/telemetry',
              schemaPath: '#/properties/telemetry/additionalProperties',
              keyword: 'additionalProperties',
              params: { additionalProperty: key2 },
              message: 'must NOT have additional properties',
            };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data17.levelId !== undefined) {
          if (
            !validate22(data17.levelId, {
              instancePath: instancePath + '/telemetry/levelId',
              parentData: data17,
              parentDataProperty: 'levelId',
              rootData,
            })
          ) {
            vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err25 = {
          instancePath: instancePath + '/telemetry',
          schemaPath: '#/properties/telemetry/type',
          keyword: 'type',
          params: { type: 'object' },
          message: 'must be object',
        };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
    }
    if (data.chambers !== undefined) {
      let data19 = data.chambers;
      if (Array.isArray(data19)) {
        const len2 = data19.length;
        for (let i2 = 0; i2 < len2; i2++) {
          let data20 = data19[i2];
          if (data20 && typeof data20 == 'object' && !Array.isArray(data20)) {
            if (data20.id === undefined) {
              const err26 = {
                instancePath: instancePath + '/chambers/' + i2,
                schemaPath: '#/properties/chambers/items/required',
                keyword: 'required',
                params: { missingProperty: 'id' },
                message: "must have required property '" + 'id' + "'",
              };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data20.region === undefined) {
              const err27 = {
                instancePath: instancePath + '/chambers/' + i2,
                schemaPath: '#/properties/chambers/items/required',
                keyword: 'required',
                params: { missingProperty: 'region' },
                message: "must have required property '" + 'region' + "'",
              };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            if (data20.problem === undefined) {
              const err28 = {
                instancePath: instancePath + '/chambers/' + i2,
                schemaPath: '#/properties/chambers/items/required',
                keyword: 'required',
                params: { missingProperty: 'problem' },
                message: "must have required property '" + 'problem' + "'",
              };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            if (data20.challengeFamily === undefined) {
              const err29 = {
                instancePath: instancePath + '/chambers/' + i2,
                schemaPath: '#/properties/chambers/items/required',
                keyword: 'required',
                params: { missingProperty: 'challengeFamily' },
                message: "must have required property '" + 'challengeFamily' + "'",
              };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
            for (const key3 in data20) {
              if (!(
                key3 === 'id' ||
                key3 === 'region' ||
                key3 === 'problem' ||
                key3 === 'challengeFamily'
              )) {
                const err30 = {
                  instancePath: instancePath + '/chambers/' + i2,
                  schemaPath: '#/properties/chambers/items/additionalProperties',
                  keyword: 'additionalProperties',
                  params: { additionalProperty: key3 },
                  message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            if (data20.id !== undefined) {
              if (
                !validate22(data20.id, {
                  instancePath: instancePath + '/chambers/' + i2 + '/id',
                  parentData: data20,
                  parentDataProperty: 'id',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                errors = vErrors.length;
              }
            }
            if (data20.region !== undefined) {
              if (
                !validate39(data20.region, {
                  instancePath: instancePath + '/chambers/' + i2 + '/region',
                  parentData: data20,
                  parentDataProperty: 'region',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
                errors = vErrors.length;
              }
            }
            if (data20.problem !== undefined) {
              if (
                !validate24(data20.problem, {
                  instancePath: instancePath + '/chambers/' + i2 + '/problem',
                  parentData: data20,
                  parentDataProperty: 'problem',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
                errors = vErrors.length;
              }
            }
            if (data20.challengeFamily !== undefined) {
              if (
                !validate24(data20.challengeFamily, {
                  instancePath: instancePath + '/chambers/' + i2 + '/challengeFamily',
                  parentData: data20,
                  parentDataProperty: 'challengeFamily',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err31 = {
              instancePath: instancePath + '/chambers/' + i2,
              schemaPath: '#/properties/chambers/items/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
      } else {
        const err32 = {
          instancePath: instancePath + '/chambers',
          schemaPath: '#/properties/chambers/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.checkpoints !== undefined) {
      let data25 = data.checkpoints;
      if (Array.isArray(data25)) {
        const len3 = data25.length;
        for (let i3 = 0; i3 < len3; i3++) {
          let data26 = data25[i3];
          if (data26 && typeof data26 == 'object' && !Array.isArray(data26)) {
            if (data26.id === undefined) {
              const err33 = {
                instancePath: instancePath + '/checkpoints/' + i3,
                schemaPath: '#/properties/checkpoints/items/required',
                keyword: 'required',
                params: { missingProperty: 'id' },
                message: "must have required property '" + 'id' + "'",
              };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data26.position === undefined) {
              const err34 = {
                instancePath: instancePath + '/checkpoints/' + i3,
                schemaPath: '#/properties/checkpoints/items/required',
                keyword: 'required',
                params: { missingProperty: 'position' },
                message: "must have required property '" + 'position' + "'",
              };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            for (const key4 in data26) {
              if (!(key4 === 'id' || key4 === 'position')) {
                const err35 = {
                  instancePath: instancePath + '/checkpoints/' + i3,
                  schemaPath: '#/properties/checkpoints/items/additionalProperties',
                  keyword: 'additionalProperties',
                  params: { additionalProperty: key4 },
                  message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
            }
            if (data26.id !== undefined) {
              if (
                !validate22(data26.id, {
                  instancePath: instancePath + '/checkpoints/' + i3 + '/id',
                  parentData: data26,
                  parentDataProperty: 'id',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                errors = vErrors.length;
              }
            }
            if (data26.position !== undefined) {
              if (
                !validate26(data26.position, {
                  instancePath: instancePath + '/checkpoints/' + i3 + '/position',
                  parentData: data26,
                  parentDataProperty: 'position',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err36 = {
              instancePath: instancePath + '/checkpoints/' + i3,
              schemaPath: '#/properties/checkpoints/items/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
      } else {
        const err37 = {
          instancePath: instancePath + '/checkpoints',
          schemaPath: '#/properties/checkpoints/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err37];
        } else {
          vErrors.push(err37);
        }
        errors++;
      }
    }
    if (data.tunnels !== undefined) {
      let data29 = data.tunnels;
      if (Array.isArray(data29)) {
        const len4 = data29.length;
        for (let i4 = 0; i4 < len4; i4++) {
          let data30 = data29[i4];
          if (data30 && typeof data30 == 'object' && !Array.isArray(data30)) {
            if (data30.id === undefined) {
              const err38 = {
                instancePath: instancePath + '/tunnels/' + i4,
                schemaPath: '#/properties/tunnels/items/required',
                keyword: 'required',
                params: { missingProperty: 'id' },
                message: "must have required property '" + 'id' + "'",
              };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (data30.region === undefined) {
              const err39 = {
                instancePath: instancePath + '/tunnels/' + i4,
                schemaPath: '#/properties/tunnels/items/required',
                keyword: 'required',
                params: { missingProperty: 'region' },
                message: "must have required property '" + 'region' + "'",
              };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
            for (const key5 in data30) {
              if (!(key5 === 'id' || key5 === 'region')) {
                const err40 = {
                  instancePath: instancePath + '/tunnels/' + i4,
                  schemaPath: '#/properties/tunnels/items/additionalProperties',
                  keyword: 'additionalProperties',
                  params: { additionalProperty: key5 },
                  message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data30.id !== undefined) {
              if (
                !validate22(data30.id, {
                  instancePath: instancePath + '/tunnels/' + i4 + '/id',
                  parentData: data30,
                  parentDataProperty: 'id',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                errors = vErrors.length;
              }
            }
            if (data30.region !== undefined) {
              if (
                !validate39(data30.region, {
                  instancePath: instancePath + '/tunnels/' + i4 + '/region',
                  parentData: data30,
                  parentDataProperty: 'region',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err41 = {
              instancePath: instancePath + '/tunnels/' + i4,
              schemaPath: '#/properties/tunnels/items/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err41];
            } else {
              vErrors.push(err41);
            }
            errors++;
          }
        }
      } else {
        const err42 = {
          instancePath: instancePath + '/tunnels',
          schemaPath: '#/properties/tunnels/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err42];
        } else {
          vErrors.push(err42);
        }
        errors++;
      }
    }
    if (data.cameraHints !== undefined) {
      let data33 = data.cameraHints;
      if (Array.isArray(data33)) {
        const len5 = data33.length;
        for (let i5 = 0; i5 < len5; i5++) {
          let data34 = data33[i5];
          if (data34 && typeof data34 == 'object' && !Array.isArray(data34)) {
            if (data34.id === undefined) {
              const err43 = {
                instancePath: instancePath + '/cameraHints/' + i5,
                schemaPath: '#/properties/cameraHints/items/required',
                keyword: 'required',
                params: { missingProperty: 'id' },
                message: "must have required property '" + 'id' + "'",
              };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            if (data34.region === undefined) {
              const err44 = {
                instancePath: instancePath + '/cameraHints/' + i5,
                schemaPath: '#/properties/cameraHints/items/required',
                keyword: 'required',
                params: { missingProperty: 'region' },
                message: "must have required property '" + 'region' + "'",
              };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
            if (data34.focus === undefined) {
              const err45 = {
                instancePath: instancePath + '/cameraHints/' + i5,
                schemaPath: '#/properties/cameraHints/items/required',
                keyword: 'required',
                params: { missingProperty: 'focus' },
                message: "must have required property '" + 'focus' + "'",
              };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
            for (const key6 in data34) {
              if (!(key6 === 'id' || key6 === 'region' || key6 === 'focus')) {
                const err46 = {
                  instancePath: instancePath + '/cameraHints/' + i5,
                  schemaPath: '#/properties/cameraHints/items/additionalProperties',
                  keyword: 'additionalProperties',
                  params: { additionalProperty: key6 },
                  message: 'must NOT have additional properties',
                };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
            if (data34.id !== undefined) {
              if (
                !validate22(data34.id, {
                  instancePath: instancePath + '/cameraHints/' + i5 + '/id',
                  parentData: data34,
                  parentDataProperty: 'id',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                errors = vErrors.length;
              }
            }
            if (data34.region !== undefined) {
              if (
                !validate39(data34.region, {
                  instancePath: instancePath + '/cameraHints/' + i5 + '/region',
                  parentData: data34,
                  parentDataProperty: 'region',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate39.errors : vErrors.concat(validate39.errors);
                errors = vErrors.length;
              }
            }
            if (data34.focus !== undefined) {
              if (
                !validate26(data34.focus, {
                  instancePath: instancePath + '/cameraHints/' + i5 + '/focus',
                  parentData: data34,
                  parentDataProperty: 'focus',
                  rootData,
                })
              ) {
                vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err47 = {
              instancePath: instancePath + '/cameraHints/' + i5,
              schemaPath: '#/properties/cameraHints/items/type',
              keyword: 'type',
              params: { type: 'object' },
              message: 'must be object',
            };
            if (vErrors === null) {
              vErrors = [err47];
            } else {
              vErrors.push(err47);
            }
            errors++;
          }
        }
      } else {
        const err48 = {
          instancePath: instancePath + '/cameraHints',
          schemaPath: '#/properties/cameraHints/type',
          keyword: 'type',
          params: { type: 'array' },
          message: 'must be array',
        };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
  } else {
    const err49 = {
      instancePath,
      schemaPath: '#/type',
      keyword: 'type',
      params: { type: 'object' },
      message: 'must be object',
    };
    if (vErrors === null) {
      vErrors = [err49];
    } else {
      vErrors.push(err49);
    }
    errors++;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
