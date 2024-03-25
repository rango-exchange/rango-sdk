import { TextField } from '@rango-dev/ui'
import React, { memo } from 'react'
import { useRangoClient } from '../../hooks/useRangoClient'

const BaseURLInput = () => {
  const { baseUrl, handleBaseUrlChange } = useRangoClient()
  return (
    <TextField
      placeholder="Base URL"
      value={baseUrl}
      onChange={(e) => handleBaseUrlChange(e.target.value)}
      size="medium"
      style={{
        position: 'relative',
        backgroundColor: '$background !important',
      }}
      onResize={undefined}
      onResizeCapture={undefined}
      crossOrigin={undefined}
    />
  )
}

export default memo(BaseURLInput)
