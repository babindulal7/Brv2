import { useParams } from 'react-router-dom'
import { AddBundle } from './AddBundle'

/**
 * **Edit Bundle** — mounts the canonical Bundle Builder in edit mode.
 * Specification v1.1 (Build Locked): "when we click edit bundle same thing comes".
 */
export interface EditBundleProps {
  bundleRef?: string | undefined
  embedded?: boolean | undefined
  onDone?: (() => void) | undefined
}

export function EditBundle(props: EditBundleProps = {}) {
  const params = useParams<{ bundleRef: string }>()
  const id = props.bundleRef ?? params.bundleRef
  return (
    <AddBundle
      {...(id !== undefined ? { bundleRef: id } : {})}
      {...(props.embedded !== undefined ? { embedded: props.embedded } : {})}
      {...(props.onDone !== undefined ? { onDone: props.onDone } : {})}
    />
  )
}

export { EditBundle as LegacyEditBundle }
export default EditBundle
